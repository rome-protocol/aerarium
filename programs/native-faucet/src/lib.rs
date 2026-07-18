//! Native SPL test-token faucet.
//!
//! Self-serve: in ONE batched instruction the caller (who is also the fee payer
//! and the recipient) gets a FIXED amount of each requested mint dropped into
//! their own wallet ATA. The reserve tokens are held in ATAs owned by a program
//! authority PDA; the program signs the transfers out with `invoke_signed`.
//!
//! This replaces an EVM-contract faucet that cost ~220K CU per token (it ran a
//! token transfer through the EVM VM). A native SPL transfer is a few thousand
//! CU, so N mints fit in one cheap tx under a single signature.
//!
//! Reserve authority PDA = `find_program_address([b"reserve"], program_id)`.
//! Reserve ATA per mint   = `get_associated_token_address(reserve_authority, mint)`.
//! User ATA per mint       = `get_associated_token_address(user, mint)`.
//!
//! Instruction data: `[tag]` only — `tag = 0` is `claim`. The set of mints to
//! drop comes from the accounts list, not the data, so a caller can't smuggle an
//! amount in: the drop is program-fixed at [`DROP_AMOUNT`].
//!
//! One-time per wallet: the program creates a `[b"claimed", user]` marker on the
//! first claim and reverts (`Custom(1)`) if it already exists, so each wallet can
//! claim exactly once.
//!
//! Account layout for `claim`:
//! ```text
//!   [0] user                        signer, writable (fee payer + recipient owner)
//!   [1] reserve_authority           the [b"reserve"] PDA (NOT a signer)
//!   [2] claimed_marker              the [b"claimed", user] PDA, writable
//!                                   (created on first claim; revert if it exists)
//!   [3] token_program               == spl_token::id()
//!   [4] associated_token_program    == spl_associated_token_account::id()
//!   [5] system_program              == system_program::id()
//!   then, repeated per mint (3 accounts each):
//!     mint        (readonly)
//!     reserve_ata (writable)  == get_associated_token_address(reserve_authority, mint)
//!     user_ata    (writable)  == get_associated_token_address(user, mint)
//! ```

use {
    solana_program::{
        account_info::{next_account_info, AccountInfo},
        entrypoint::ProgramResult,
        program::{invoke, invoke_signed},
        program_error::ProgramError,
        pubkey::Pubkey,
        rent::Rent,
        sysvar::Sysvar,
    },
    solana_system_interface::{instruction as system_instruction, program as system_program},
    spl_associated_token_account::{
        get_associated_token_address,
        instruction::create_associated_token_account_idempotent,
    },
};

/// PDA seed prefix for the reserve authority.
pub const RESERVE_SEED: &[u8] = b"reserve";

/// PDA seed prefix for the per-wallet one-time claim marker.
pub const CLAIMED_SEED: &[u8] = b"claimed";

/// Instruction tag for `claim`.
const CLAIM_TAG: u8 = 0;

/// Fixed per-mint drop: 1.0 token at 9 decimals. All faucet tokens are 9-dec.
/// The amount is program-fixed (never client-supplied), so a caller can't
/// over-draw the reserve per call.
const DROP_AMOUNT: u64 = 1_000_000_000;

/// Custom error: this wallet has already claimed (the claim marker exists).
const ERR_ALREADY_CLAIMED: u32 = 1;

/// Fixed leading accounts before the repeating mint groups.
/// (user, reserve_authority, claimed_marker, token, ata, system)
const FIXED_ACCOUNTS: usize = 6;
/// Accounts per mint group: mint, reserve_ata, user_ata.
const ACCOUNTS_PER_GROUP: usize = 3;

/// Verify an account's key equals the expected program id before we trust it as
/// a CPI target. Hard-pins the program so no caller-substituted program can
/// intercept the CPI (arbitrary-CPI guard).
#[inline]
fn verify_program_id(account: &AccountInfo, expected_id: &Pubkey) -> ProgramResult {
    if *account.key != *expected_id {
        return Err(ProgramError::IncorrectProgramId);
    }
    Ok(())
}

/// Validate a PDA: re-derive the canonical (address, bump) for `seeds` under
/// `program_id`, require the supplied `account` to equal that canonical address,
/// and return the canonical bump.
///
/// Bump canonicalization: this is a STATELESS signer PDA (no account data, so no
/// stored bump to read back). The canonical bump is therefore established here,
/// at validation time. We bind the derived address to the supplied account
/// (`account.key == expected`), and because `find_program_address` only ever
/// returns the single canonical (highest) bump that lands off-curve, the bump we
/// return is canonical by construction — a caller cannot influence it (it is not
/// taken from instruction data). A non-canonical bump cannot reproduce
/// `expected`, so it could never have matched `account.key`.
#[inline]
fn validate_pda(
    account: &AccountInfo,
    seeds: &[&[u8]],
    program_id: &Pubkey,
) -> Result<u8, ProgramError> {
    let (expected, canonical_bump) = Pubkey::find_program_address(seeds, program_id);
    if *account.key != expected {
        return Err(ProgramError::InvalidSeeds);
    }
    Ok(canonical_bump)
}

#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let (tag, rest) = instruction_data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;
    // tag 0 = claim; no other data — mints come from the accounts list.
    if *tag != CLAIM_TAG || !rest.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }

    // ---- validate the fixed leading accounts ---------------------------------
    let it = &mut accounts.iter();
    let user = next_account_info(it)?;
    let reserve_authority = next_account_info(it)?;
    let claimed_marker = next_account_info(it)?;
    let token_program = next_account_info(it)?;
    let associated_token_program = next_account_info(it)?;
    let system_prog = next_account_info(it)?;

    // user is the fee payer + recipient owner — must sign, must be writable
    // (it pays rent for any ATA it doesn't yet have).
    if !user.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !user.is_writable {
        return Err(ProgramError::InvalidAccountData);
    }

    // reserve authority must be exactly the [b"reserve"] PDA. The program signs
    // for it (NOT the caller). `validate_pda` re-derives the canonical address +
    // bump and pins the account to it; the bump is program-derived (never
    // caller-supplied), so a non-canonical bump can't produce a colliding key.
    // The reserve authority is a STATELESS signer PDA (no account data — its
    // tokens live in separate ATAs), so there is no stored bump to compare to:
    // the canonical bump returned here IS the source of truth.
    // `validate_pda` returns the canonical bump (the one `find_program_address`
    // yields). For a stateless signer PDA there is no account-stored bump to
    // diff against; the canonical derivation IS the authority. This is the same
    // pattern as Light Protocol's audited `verify_pda`. The runtime re-derives
    // the PDA inside `invoke_signed` and only signs on an address match, so a
    // forged bump can never produce a valid reserve signer.
    let reserve_bump = validate_pda(reserve_authority, &[RESERVE_SEED], program_id)?;

    // Pin the three programs so a caller can't substitute a malicious program.
    verify_program_id(token_program, &spl_token::id())?;
    verify_program_id(associated_token_program, &spl_associated_token_account::id())?;
    verify_program_id(system_prog, &system_program::id())?;

    // ---- one-time-per-wallet guard -------------------------------------------
    // The claim marker is a per-user PDA [b"claimed", user]. We create it on the
    // FIRST claim (program-signed, user-funded) and revert if it already exists,
    // so each wallet can claim exactly once. Bind the supplied account to the
    // canonical derivation, then check existence BEFORE the drops so a repeat
    // claim fails cheaply with a clear error (no tokens move).
    let (expected_claimed, claimed_bump) =
        Pubkey::find_program_address(&[CLAIMED_SEED, user.key.as_ref()], program_id);
    if *claimed_marker.key != expected_claimed {
        return Err(ProgramError::InvalidSeeds);
    }
    // Already claimed ⇒ the marker account is initialized (owned, has lamports).
    if !claimed_marker.data_is_empty() || claimed_marker.lamports() > 0 {
        return Err(ProgramError::Custom(ERR_ALREADY_CLAIMED));
    }
    // Create the 1-byte marker owned by this program (user pays rent). A second
    // claim re-enters here and hits the existence check above. create_account is
    // program-signed via the claim-marker seeds so no caller can forge it.
    let marker_rent = Rent::get()?.minimum_balance(1);
    invoke_signed(
        &system_instruction::create_account(
            user.key,
            claimed_marker.key,
            marker_rent,
            1,
            program_id,
        ),
        &[user.clone(), claimed_marker.clone(), system_prog.clone()],
        &[&[CLAIMED_SEED, user.key.as_ref(), &[claimed_bump]]],
    )?;

    // ---- shape the repeating mint groups -------------------------------------
    let group_bytes = accounts
        .len()
        .checked_sub(FIXED_ACCOUNTS)
        .ok_or(ProgramError::NotEnoughAccountKeys)?;
    if group_bytes % ACCOUNTS_PER_GROUP != 0 {
        return Err(ProgramError::InvalidAccountData);
    }
    let group_count = group_bytes / ACCOUNTS_PER_GROUP;
    if group_count == 0 {
        // need at least one mint to drop
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    // PDA signer seeds for transfers out of the reserve.
    let reserve_signer_seeds: &[&[u8]] = &[RESERVE_SEED, &[reserve_bump]];

    // ---- per mint group: idempotently create user ATA, then transfer ---------
    for _ in 0..group_count {
        let mint = next_account_info(it)?;
        let reserve_ata = next_account_info(it)?;
        let user_ata = next_account_info(it)?;

        // Bind source + dest to the canonical ATAs so a spoofed source (drain
        // someone else's reserve) or dest (send to an attacker) is rejected.
        let expected_reserve_ata =
            get_associated_token_address(reserve_authority.key, mint.key);
        if *reserve_ata.key != expected_reserve_ata {
            return Err(ProgramError::InvalidSeeds);
        }
        let expected_user_ata = get_associated_token_address(user.key, mint.key);
        if *user_ata.key != expected_user_ata {
            return Err(ProgramError::InvalidSeeds);
        }

        // 1. Create the user's ATA if missing. Idempotent variant => an existing
        //    ATA is a no-op (it only errors on a wrong-owner collision). The user
        //    is funding + wallet, and the user signs this CPI.
        //
        //    Re-verify both CPI program ids right at the call site, and build the
        //    instruction against the hard-coded canonical ids (NOT the passed-in
        //    account keys), so no caller-supplied program can intercept this CPI
        //    (arbitrary-CPI guard).
        verify_program_id(associated_token_program, &spl_associated_token_account::id())?;
        verify_program_id(token_program, &spl_token::id())?;
        if user_ata.data_is_empty() || user_ata.lamports() == 0 {
            let create_ix = create_associated_token_account_idempotent(
                user.key,            // funding (pays rent)
                user.key,            // wallet (ATA owner)
                mint.key,
                &spl_token::id(),    // token program (canonical, pinned)
            );
            invoke(
                &create_ix,
                &[
                    user.clone(),
                    user_ata.clone(),
                    user.clone(),
                    mint.clone(),
                    system_prog.clone(),
                    token_program.clone(),
                ],
            )?;
        }

        // 2. Transfer the fixed drop out of the reserve ATA into the user ATA.
        //    The reserve authority PDA is the source owner, so the program signs
        //    via invoke_signed with the [b"reserve", bump] seeds. Re-verify the
        //    token program at the call site and build against the canonical
        //    `spl_token::id()` (arbitrary-CPI guard).
        verify_program_id(token_program, &spl_token::id())?;
        let transfer_ix = spl_token::instruction::transfer(
            &spl_token::id(),
            reserve_ata.key,
            user_ata.key,
            reserve_authority.key,
            &[],
            DROP_AMOUNT,
        )?;
        invoke_signed(
            &transfer_ix,
            &[
                reserve_ata.clone(),
                user_ata.clone(),
                reserve_authority.clone(),
                token_program.clone(),
            ],
            &[reserve_signer_seeds],
        )?;
    }

    // One-time per wallet is enforced above by the [b"claimed", user] marker.
    Ok(())
}

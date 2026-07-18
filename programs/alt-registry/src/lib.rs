//! ALT pointer registry.
//!
//! A deterministic on-chain pointer so a Solana-native Compound user can
//! rediscover their Address Lookup Table across devices without localStorage.
//!
//! PDA: `[b"alt", authority, comet] -> AltPointer { alt, bump }`
//!
//! The ALT address itself is `find_program_address([authority, recent_slot])`
//! (slot-dependent, un-rederivable). This registry stores that address keyed by
//! the deterministic `(authority, comet)` pair, so the client recovers it with a
//! single `getAccountInfo` on the derived pointer PDA.
//!
//! Instruction data: `[tag=0] ++ comet(20) ++ alt(32)`.
//! Accounts: `[pointer PDA (w), authority (signer, w = payer), system_program]`.

use {
    borsh::{BorshDeserialize, BorshSerialize},
    solana_program::{
        account_info::{next_account_info, AccountInfo},
        entrypoint::ProgramResult,
        program::invoke_signed,
        program_error::ProgramError,
        pubkey::Pubkey,
        rent::Rent,
        sysvar::Sysvar,
    },
    solana_system_interface::instruction::create_account,
};

/// PDA seed prefix.
pub const POINTER_SEED: &[u8] = b"alt";

/// Instruction tag for SetAlt.
const SET_ALT_TAG: u8 = 0;

/// Borsh-serialized size of [`AltPointer`]: alt(32) + bump(1).
pub const ALT_POINTER_LEN: usize = 33;

/// Stored pointer record.
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq, Eq)]
pub struct AltPointer {
    /// The Address Lookup Table address this (authority, comet) maps to.
    pub alt: [u8; 32],
    /// PDA bump.
    pub bump: u8,
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
    if *tag != SET_ALT_TAG || rest.len() != 20 + 32 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let comet: [u8; 20] = rest[..20].try_into().unwrap();
    let alt: [u8; 32] = rest[20..52].try_into().unwrap();

    let it = &mut accounts.iter();
    let pointer = next_account_info(it)?;
    let authority = next_account_info(it)?;
    let system_program = next_account_info(it)?;

    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Derive + verify the pointer PDA — the (authority, comet) pair fully
    // determines the address, so a caller can't write under someone else's key.
    let (expected, bump) =
        Pubkey::find_program_address(&[POINTER_SEED, authority.key.as_ref(), &comet], program_id);
    if expected != *pointer.key {
        return Err(ProgramError::InvalidSeeds);
    }

    // Create on first write; overwrite in place on re-point.
    if pointer.data_is_empty() {
        let lamports = Rent::get()?.minimum_balance(ALT_POINTER_LEN);
        let ix = create_account(
            authority.key,
            pointer.key,
            lamports,
            ALT_POINTER_LEN as u64,
            program_id,
        );
        invoke_signed(
            &ix,
            &[authority.clone(), pointer.clone(), system_program.clone()],
            &[&[POINTER_SEED, authority.key.as_ref(), &comet, &[bump]]],
        )?;
    } else if pointer.owner != program_id {
        return Err(ProgramError::IllegalOwner);
    }

    let record = AltPointer { alt, bump };
    let mut data = pointer.try_borrow_mut_data()?;
    borsh::to_writer(&mut data[..], &record).map_err(|_| ProgramError::AccountDataTooSmall)?;
    Ok(())
}

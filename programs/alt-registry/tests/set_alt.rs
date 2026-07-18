use {
    alt_registry::{process_instruction, AltPointer, POINTER_SEED},
    borsh::BorshDeserialize,
    solana_program_test::{processor, ProgramTest},
    solana_sdk::{
        account::Account,
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
        signature::{Keypair, Signer},
        transaction::Transaction,
    },
    std::str::FromStr,
};

/// System program id (all-zero pubkey), via the test's own Pubkey type to avoid
/// cross-crate version coupling.
fn system_program_id() -> Pubkey {
    Pubkey::from_str("11111111111111111111111111111111").unwrap()
}

/// SetAlt(comet[20], alt[32]) creates the pointer PDA owned by the program,
/// decoding to the supplied ALT address.
#[tokio::test]
async fn set_alt_creates_pointer_pda() {
    let program_id = Pubkey::new_unique();
    let pt = ProgramTest::new("alt_registry", program_id, processor!(process_instruction));
    let (mut banks, payer, recent_blockhash) = pt.start().await;

    let comet: [u8; 20] = [0x77; 20];
    let alt = Pubkey::new_unique();
    let (pointer, _bump) =
        Pubkey::find_program_address(&[POINTER_SEED, payer.pubkey().as_ref(), &comet], &program_id);

    // [tag=0=SetAlt] ++ comet(20) ++ alt(32)
    let mut data = vec![0u8];
    data.extend_from_slice(&comet);
    data.extend_from_slice(alt.as_ref());

    let ix = Instruction::new_with_bytes(
        program_id,
        &data,
        vec![
            AccountMeta::new(pointer, false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program_id(), false),
        ],
    );
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );
    banks.process_transaction(tx).await.unwrap();

    let acct = banks
        .get_account(pointer)
        .await
        .unwrap()
        .expect("pointer PDA should exist after set_alt");
    assert_eq!(acct.owner, program_id, "pointer must be owned by the registry program");

    let stored = AltPointer::try_from_slice(&acct.data).expect("decode AltPointer");
    assert_eq!(stored.alt, alt.to_bytes(), "stored ALT must equal the supplied address");
}

const COMET: [u8; 20] = [0x77; 20];

fn set_alt_ix(
    program_id: &Pubkey,
    authority: &Pubkey,
    authority_is_signer: bool,
    pointer: &Pubkey,
    comet: &[u8; 20],
    alt: &Pubkey,
) -> Instruction {
    let mut data = vec![0u8];
    data.extend_from_slice(comet);
    data.extend_from_slice(alt.as_ref());
    Instruction::new_with_bytes(
        *program_id,
        &data,
        vec![
            AccountMeta::new(*pointer, false),
            AccountMeta {
                pubkey: *authority,
                is_signer: authority_is_signer,
                is_writable: true,
            },
            AccountMeta::new_readonly(system_program_id(), false),
        ],
    )
}

/// A second SetAlt with the same (authority, comet) overwrites the stored ALT.
#[tokio::test]
async fn set_alt_overwrites_existing_pointer() {
    let program_id = Pubkey::new_unique();
    let pt = ProgramTest::new("alt_registry", program_id, processor!(process_instruction));
    let (mut banks, payer, blockhash) = pt.start().await;

    let (pointer, _bump) =
        Pubkey::find_program_address(&[POINTER_SEED, payer.pubkey().as_ref(), &COMET], &program_id);
    let alt1 = Pubkey::new_unique();
    let alt2 = Pubkey::new_unique();

    let ix1 = set_alt_ix(&program_id, &payer.pubkey(), true, &pointer, &COMET, &alt1);
    banks
        .process_transaction(Transaction::new_signed_with_payer(
            &[ix1],
            Some(&payer.pubkey()),
            &[&payer],
            blockhash,
        ))
        .await
        .unwrap();

    let blockhash2 = banks.get_latest_blockhash().await.unwrap();
    let ix2 = set_alt_ix(&program_id, &payer.pubkey(), true, &pointer, &COMET, &alt2);
    banks
        .process_transaction(Transaction::new_signed_with_payer(
            &[ix2],
            Some(&payer.pubkey()),
            &[&payer],
            blockhash2,
        ))
        .await
        .unwrap();

    let acct = banks.get_account(pointer).await.unwrap().expect("pointer exists");
    let stored = AltPointer::try_from_slice(&acct.data).unwrap();
    assert_eq!(stored.alt, alt2.to_bytes(), "second set_alt must overwrite the first");
}

/// SetAlt requires the authority to sign — else anyone could write under any key.
#[tokio::test]
async fn set_alt_requires_authority_signer() {
    let program_id = Pubkey::new_unique();
    let pt = ProgramTest::new("alt_registry", program_id, processor!(process_instruction));
    let (mut banks, payer, blockhash) = pt.start().await;

    let authority = Keypair::new(); // a different key, NOT a signer of the tx
    let (pointer, _bump) = Pubkey::find_program_address(
        &[POINTER_SEED, authority.pubkey().as_ref(), &COMET],
        &program_id,
    );
    let alt = Pubkey::new_unique();
    let ix = set_alt_ix(&program_id, &authority.pubkey(), false, &pointer, &COMET, &alt);

    let res = banks
        .process_transaction(Transaction::new_signed_with_payer(
            &[ix],
            Some(&payer.pubkey()),
            &[&payer],
            blockhash,
        ))
        .await;
    assert!(res.is_err(), "set_alt without authority signature must fail");
}

/// SetAlt rejects a pointer account that is not the (authority, comet) PDA.
#[tokio::test]
async fn set_alt_rejects_wrong_pointer_pda() {
    let program_id = Pubkey::new_unique();
    let pt = ProgramTest::new("alt_registry", program_id, processor!(process_instruction));
    let (mut banks, payer, blockhash) = pt.start().await;

    let wrong_pointer = Pubkey::new_unique(); // not the derived PDA
    let alt = Pubkey::new_unique();
    let ix = set_alt_ix(&program_id, &payer.pubkey(), true, &wrong_pointer, &COMET, &alt);

    let res = banks
        .process_transaction(Transaction::new_signed_with_payer(
            &[ix],
            Some(&payer.pubkey()),
            &[&payer],
            blockhash,
        ))
        .await;
    assert!(res.is_err(), "set_alt with a non-PDA pointer must fail");
}

/// An existing pointer can only be overwritten by its authority. The overwrite
/// path skips the create CPI, so the explicit signer check is the SOLE guard
/// here — the runtime won't catch it for us.
#[tokio::test]
async fn set_alt_non_signer_cannot_overwrite_existing() {
    let program_id = Pubkey::new_unique();
    let attacker = Keypair::new();
    let mut pt = ProgramTest::new("alt_registry", program_id, processor!(process_instruction));
    // Fund the attacker so a failed overwrite fails on the guard, not on fees.
    pt.add_account(
        attacker.pubkey(),
        Account::new(1_000_000_000, 0, &system_program_id()),
    );
    let (mut banks, payer, blockhash) = pt.start().await;

    // payer (signer) creates the pointer under its own authority.
    let (pointer, _b) =
        Pubkey::find_program_address(&[POINTER_SEED, payer.pubkey().as_ref(), &COMET], &program_id);
    let alt1 = Pubkey::new_unique();
    banks
        .process_transaction(Transaction::new_signed_with_payer(
            &[set_alt_ix(&program_id, &payer.pubkey(), true, &pointer, &COMET, &alt1)],
            Some(&payer.pubkey()),
            &[&payer],
            blockhash,
        ))
        .await
        .unwrap();

    // Attacker pays + signs, but lists payer's authority as a NON-signer and
    // tries to repoint the existing pointer.
    let bh2 = banks.get_latest_blockhash().await.unwrap();
    let alt2 = Pubkey::new_unique();
    let res = banks
        .process_transaction(Transaction::new_signed_with_payer(
            &[set_alt_ix(&program_id, &payer.pubkey(), false, &pointer, &COMET, &alt2)],
            Some(&attacker.pubkey()),
            &[&attacker],
            bh2,
        ))
        .await;
    assert!(res.is_err(), "a non-signer must not overwrite an existing pointer");

    // The stored ALT is unchanged.
    let acct = banks.get_account(pointer).await.unwrap().expect("pointer exists");
    assert_eq!(
        AltPointer::try_from_slice(&acct.data).unwrap().alt,
        alt1.to_bytes(),
        "pointer must still hold the authority's original ALT"
    );
}

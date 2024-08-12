// Migrations are an early feature. Currently, they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.

import {
  BN,
  getProvider,
  Program,
  Provider,
  setProvider,
  workspace,
} from "@coral-xyz/anchor";
import { S3AssetManagerVault } from "../target/types/s_3_asset_manager_vault";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  RpcResponseAndContext,
  sendAndConfirmTransaction,
  SignatureResult,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  createMint,
  mintTo,
} from "@solana/spl-token";
import { config } from "dotenv";

const PDA_VAULT_SEED = "vault";
const PDA_CUSTOMER_VAULT_ACCOUNT_SEED = "customer";
const TOKEN_DECIMALS = 3;

module.exports = async function (provider: Provider) {
  setProvider(provider);

  config();

  const program = workspace.S3AssetManagerVault as Program<S3AssetManagerVault>;

  const deployProvider = getProvider();

  const manager = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.PRIVATE_KEY))
  );

  const customer = Keypair.generate();

  const { mint, customerAta } = await prepareDeploy(
    manager,
    customer,
    program,
    deployProvider
  );

  await intializeVault(program, deployProvider, manager);

  await deposit(program, provider, customer, customerAta, mint);

  await withdraw(program, provider, customer, customerAta, mint);
};

const prepareDeploy = async (
  manager: Keypair,
  customer: Keypair,
  program: Program<S3AssetManagerVault>,
  provider: Provider
) => {
  // let airdropManager: string;

  // try {
  //   airdropManager = await program.provider.connection.requestAirdrop(
  //     manager.publicKey,
  //     0.4 * LAMPORTS_PER_SOL
  //   );
  // } catch (error) {
  //   throw "airdrop manager failed";
  // }

  // const managerConfirmation = await confirmTransaction(
  //   provider,
  //   airdropManager
  // );

  // if (managerConfirmation.value.err) {
  //   throw managerConfirmation.value.err;
  // }

  // let airdropCustomer: string;

  // try {
  //   airdropCustomer = await program.provider.connection.requestAirdrop(
  //     customer.publicKey,
  //     0.4 * LAMPORTS_PER_SOL
  //   );
  // } catch (error) {
  //   console.error(error);

  //   throw "airdrop customer failed";
  // }

  // const customerAirdropConfirmation = await confirmTransaction(
  //   provider,
  //   airdropCustomer
  // );

  // if (customerAirdropConfirmation.value.err) {
  //   throw customerAirdropConfirmation.value.err;
  // }

  const transferTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: manager.publicKey,
      toPubkey: customer.publicKey,
      lamports: 1 * LAMPORTS_PER_SOL,
    })
  );

  try {
    await sendAndConfirmTransaction(provider.connection, transferTx, [manager]);
  } catch (error) {
    console.error(error);

    throw "manager transfer failed";
  }

  let mint: PublicKey;
  let customerAta: PublicKey;

  try {
    mint = await createMint(
      program.provider.connection,
      manager,
      manager.publicKey,
      null,
      TOKEN_DECIMALS
    );
  } catch (error) {
    console.error(error);

    throw "create mint failed";
  }

  try {
    customerAta = await createAssociatedTokenAccount(
      program.provider.connection,
      customer,
      mint,
      customer.publicKey
    );
  } catch (error) {
    throw "create customerAta failed";
  }

  let mintToTx: string;

  try {
    mintToTx = await mintTo(
      provider.connection,
      customer,
      mint,
      customerAta,
      manager,
      BigInt(100 * Math.pow(10, TOKEN_DECIMALS))
    );
  } catch (error) {
    console.error(error);

    throw "mint tokens failed";
  }

  const mintToConfirmation = await confirmTransaction(provider, mintToTx);

  if (mintToConfirmation.value.err) {
    throw mintToConfirmation.value.err;
  }

  return { mint, customerAta };
};

const intializeVault = async (
  program: Program<S3AssetManagerVault>,
  provider: Provider,
  manager: Keypair
) => {
  let tx: string;

  try {
    tx = await program.methods
      .initializeVault()
      .accounts({
        manager: manager.publicKey,
      })
      .signers([manager])
      .rpc();
  } catch (error) {
    console.error(error);
    throw "initialize vault failed";
  }

  const confirmation = await confirmTransaction(provider, tx);

  if (confirmation.value.err) {
    throw confirmation.value.err;
  }
  console.log("Initialize vault tx: ", tx);
};

const deposit = async (
  program: Program<S3AssetManagerVault>,
  provider: Provider,
  customer: Keypair,
  customerAta: PublicKey,
  mint: PublicKey
) => {
  const vaultPda = getVaultPda(program);

  let tx: string;

  try {
    tx = await program.methods
      .deposit(new BN(5.123 * Math.pow(10, TOKEN_DECIMALS)))
      .accounts({
        customer: customer.publicKey,
        customerTokenAccount: customerAta,
        mint: mint,
        vault: vaultPda,
      })
      .signers([customer])
      .rpc();
  } catch (error) {
    console.error(error);

    throw "deposit failed";
  }

  const depositTxConfirmation = await confirmTransaction(provider, tx);

  if (depositTxConfirmation.value.err) {
    throw depositTxConfirmation.value.err;
  }

  console.log("Deposit tx: ", tx);
};

const withdraw = async (
  program: Program<S3AssetManagerVault>,
  provider: Provider,
  customer: Keypair,
  customerAta: PublicKey,
  mint: PublicKey
) => {
  const vaultPda = getVaultPda(program);

  let tx: string;

  try {
    tx = await program.methods
      .withdraw(new BN(2.112 * Math.pow(10, TOKEN_DECIMALS)))
      .accounts({
        customer: customer.publicKey,
        customerTokenAccount: customerAta,
        mint: mint,
        vault: vaultPda,
      })
      .signers([customer])
      .rpc();
  } catch (error) {
    console.error(error);

    throw "withdraw failed";
  }

  const confirmation = await confirmTransaction(provider, tx);

  if (confirmation.value.err) {
    throw confirmation.value.err;
  }

  console.log("Withdraw tx: ", tx);
};

const getVaultPda = (program: Program<S3AssetManagerVault>): PublicKey => {
  const [vaultPda, vaultPdaBumpState] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_VAULT_SEED)],
    program.programId
  );

  return vaultPda;
};

const confirmTransaction = async (
  provider: Provider,
  tx: string
): Promise<RpcResponseAndContext<SignatureResult>> => {
  const bh = await provider.connection.getLatestBlockhash();

  return await provider.connection.confirmTransaction(
    {
      signature: tx,
      blockhash: bh.blockhash,
      lastValidBlockHeight: bh.lastValidBlockHeight,
    },
    "confirmed"
  );
};

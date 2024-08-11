import {
  workspace,
  setProvider,
  AnchorProvider,
  Program,
  getProvider,
  Provider,
} from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  RpcResponseAndContext,
  SignatureResult,
} from "@solana/web3.js";
import { before } from "mocha";
import { S3AssetManagerVault } from "../target/types/s_3_asset_manager_vault";
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  mintTo,
} from "@solana/spl-token";
import { BN } from "bn.js";
import { expect } from "chai";

describe("s3-asset-manager-vault", () => {
  setProvider(AnchorProvider.env());

  const program = workspace.S3AssetManagerVault as Program<S3AssetManagerVault>;
  const provider = getProvider();
  const PDA_VAULT_SEED = "vault";
  const PDA_CUSTOMER_VAULT_ACCOUNT_SEED = "customer";
  const TOKEN_DECIMALS = 3;

  let manager: Keypair;
  let mint: PublicKey;

  let customer: Keypair;
  let customerATA: PublicKey;

  before(async () => {
    manager = Keypair.generate();

    const aridropTx = await program.provider.connection.requestAirdrop(
      manager.publicKey,
      5 * LAMPORTS_PER_SOL
    );

    const confirmation = await confirmTransaction(provider, aridropTx);

    if (confirmation.value.err) {
      throw confirmation.value.err;
    }

    try {
      mint = await createMint(
        program.provider.connection,
        manager,
        manager.publicKey,
        null,
        TOKEN_DECIMALS
      );
    } catch (error) {
      console.log("create mint failed");
    }
  });

  it("should initialize vault", async () => {
    const tx = await program.methods
      .initializeVault()
      .accounts({
        manager: manager.publicKey,
      })
      .signers([manager])
      .rpc();

    const confirmation = await confirmTransaction(provider, tx);

    if (confirmation.value.err) {
      throw confirmation.value.err;
    }
  });

  describe("customer tests", () => {
    before(async () => {
      customer = Keypair.generate();

      const aridropTx = await program.provider.connection.requestAirdrop(
        customer.publicKey,
        5 * LAMPORTS_PER_SOL
      );

      const confirmation = await confirmTransaction(provider, aridropTx);

      if (confirmation.value.err) {
        throw confirmation.value.err;
      }

      try {
        customerATA = await createAssociatedTokenAccount(
          program.provider.connection,
          customer,
          mint,
          customer.publicKey
        );
      } catch (error) {
        console.log("create customerATA failed");
      }

      const mintToTx = await mintTo(
        provider.connection,
        customer,
        mint,
        customerATA,
        manager,
        BigInt(100 * Math.pow(10, TOKEN_DECIMALS))
      );

      const mintToConfirmation = await confirmTransaction(provider, mintToTx);

      if (mintToConfirmation.value.err) {
        throw mintToConfirmation.value.err;
      }
    });

    afterEach(async () => {
      const [customerPDA, customerPdaBumpState] =
        PublicKey.findProgramAddressSync(
          [
            Buffer.from(PDA_VAULT_SEED),
            Buffer.from(PDA_CUSTOMER_VAULT_ACCOUNT_SEED),
            customer.publicKey.toBytes(),
          ],
          program.programId
        );

      const customerAccount = await program.account.customerVaultAccount.fetch(
        customerPDA
      );

      const ata = await getAccount(provider.connection, customerATA);

      console.log("ata: ", ata.address.toBase58());
      console.log("ata amount: ", ata.amount);

      console.log(
        "vault token account: ",
        customerAccount.vaultTokenAccount.toBase58()
      );
      console.log("balance: ", customerAccount.balance.toNumber());
    });

    it("should deposit tokens", async () => {
      const [vaultPda, vaultPdaBumpState] = PublicKey.findProgramAddressSync(
        [Buffer.from(PDA_VAULT_SEED), manager.publicKey.toBuffer()],
        program.programId
      );

      const depositTx = await program.methods
        .deposit(new BN(3.123 * Math.pow(10, TOKEN_DECIMALS)))
        .accounts({
          customer: customer.publicKey,
          customerTokenAccount: customerATA,
          mint: mint,
          vault: vaultPda,
        })
        .signers([customer])
        .rpc();

      const depositTxConfirmation = await confirmTransaction(
        provider,
        depositTx
      );

      if (depositTxConfirmation.value.err) {
        throw depositTxConfirmation.value.err;
      }
    });

    it("should deposit tokens into same account", async () => {
      const [vaultPda, vaultPdaBumpState] = PublicKey.findProgramAddressSync(
        [Buffer.from(PDA_VAULT_SEED), manager.publicKey.toBuffer()],
        program.programId
      );

      const depositTx = await program.methods
        .deposit(new BN(3.123 * Math.pow(10, TOKEN_DECIMALS)))
        .accounts({
          customer: customer.publicKey,
          customerTokenAccount: customerATA,
          mint: mint,
          vault: vaultPda,
        })
        .signers([customer])
        .rpc();

      const depositTxConfirmation = await confirmTransaction(
        provider,
        depositTx
      );

      if (depositTxConfirmation.value.err) {
        throw depositTxConfirmation.value.err;
      }
    });

    it("should withdraw tokens", async () => {
      const [vaultPda, vaultPdaBumpState] = PublicKey.findProgramAddressSync(
        [Buffer.from(PDA_VAULT_SEED), manager.publicKey.toBuffer()],
        program.programId
      );

      const withdrawTx = await program.methods
        .withdraw(new BN(2.112 * Math.pow(10, TOKEN_DECIMALS)))
        .accounts({
          customer: customer.publicKey,
          customerTokenAccount: customerATA,
          mint: mint,
          vault: vaultPda,
        })
        .signers([customer])
        .rpc();

      const depositTxConfirmation = await confirmTransaction(
        provider,
        withdrawTx
      );

      if (depositTxConfirmation.value.err) {
        throw depositTxConfirmation.value.err;
      }
    });
  });
});

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

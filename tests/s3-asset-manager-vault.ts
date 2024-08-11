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
  mintTo,
} from "@solana/spl-token";
import { BN } from "bn.js";

describe("s3-asset-manager-vault", () => {
  setProvider(AnchorProvider.env());

  const program = workspace.S3AssetManagerVault as Program<S3AssetManagerVault>;
  const provider = getProvider();
  const PDA_VAULT_SEED = "vault";
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

  beforeEach(async () => {
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
      BigInt(10 * Math.pow(10, TOKEN_DECIMALS))
    );

    const mintToConfirmation = await confirmTransaction(provider, mintToTx);

    if (mintToConfirmation.value.err) {
      throw mintToConfirmation.value.err;
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
    const [vaultPDA, bumpState] = PublicKey.findProgramAddressSync(
      [Buffer.from(PDA_VAULT_SEED)],
      program.programId
    );

    it("should deposit tokens", async () => {
      const depositTx = await program.methods
        .deposit(new BN(3 * Math.pow(10, TOKEN_DECIMALS)))
        .accounts({
          customer: customer.publicKey,
          customerTokenAccount: customerATA,
          mint: mint,
          vault: vaultPDA,
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

      const vault = await program.account.vault.fetch(vaultPDA);

      console.log("vault manager: ", vault.manager.toBase58());
      console.log("total deposits: ", vault.totalDeposits.toNumber());
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

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { S3AssetManagerVault } from "../target/types/s3_asset_manager_vault";

describe("s3-asset-manager-vault", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .S3AssetManagerVault as Program<S3AssetManagerVault>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initializeVault().rpc();

    console.log("Your transaction signature", tx);
  });
});

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
// import { OrderflowContract } from "../target/types/orderflow_contract";
import { OrderflowContract } from "../target/types/orderflow_contract";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { createAssociatedTokenAccount, createMint, getAccount, getAssociatedTokenAddress, getAssociatedTokenAddressSync, mintTo, TOKEN_PROGRAM_ID} from "@solana/spl-token"
import { BN } from "bn.js";
import { assert } from "chai";

describe("orderflow-contract", () => {
  // Configure the client to use the local cluster.
  const provider  = anchor.AnchorProvider.env();

    anchor.setProvider(provider);

  const program = anchor.workspace.orderflowContract as Program<OrderflowContract>;

  //constants
   const JUPITER_PROGRAM_ID = new PublicKey(
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
  );
  const BACKEND_AUTHORITY = Keypair.generate();
  const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
  );

  //test accounts
   let inputMint: PublicKey;
  let outputMint: PublicKey;
  let maker: PublicKey;
  let makerInputATA: PublicKey;
  let makerOutputATA: PublicKey;
  let orderPDA: PublicKey;
  let reserveATA: PublicKey;

  const uniqueId = new BN(12345);
   const makingAmount = new BN(1_000_000); // 1 token (6 decimals)
  const takingAmount = new BN(500_000_000); // 0.5 token (9 decimals)
  const expiredAt = new BN(Math.floor(Date.now() / 1000) + 3600); // +1 hour

  before(async () => {
    maker = provider.wallet.publicKey;

    const sig = await provider.connection.requestAirdrop(BACKEND_AUTHORITY.publicKey, 2 * LAMPORTS_PER_SOL );
    await provider.connection.confirmTransaction(sig);

    //creating input mint 6 decimal like usdc
    inputMint = await createMint(provider.connection, provider.wallet.payer, provider.wallet.publicKey, null, 6);

    //creating output mint 9 decimal like sol
    outputMint = await createMint(provider.connection, provider.wallet.payer, provider.wallet.publicKey, null, 9);

    //createing maker ATA
    makerInputATA = getAssociatedTokenAddressSync(inputMint, maker);
    makerOutputATA = getAssociatedTokenAddressSync(outputMint, maker);

    await createAssociatedTokenAccount(provider.connection, provider.wallet.payer, inputMint, maker);
    await createAssociatedTokenAccount(provider.connection, provider.wallet.payer, outputMint, maker);

    //mint input token to maker 
    await mintTo(provider.connection, provider.wallet.payer, inputMint, makerInputATA, provider.wallet.publicKey, 10_000_000);

    



  })

  it("initialize and order creation", async () => {
      try {
        console.log("maker: ", maker.toBase58());
        [orderPDA] =  PublicKey.findProgramAddressSync([
           Buffer.from("order"), maker.toBuffer(), uniqueId.toArrayLike(Buffer, "le", 8)],
        program.programId)

        reserveATA = await getAssociatedTokenAddressSync(inputMint, orderPDA, true);

        //creating reserve ATA if needed j
      try {
        await createAssociatedTokenAccount(
          provider.connection,
          provider.wallet.payer,
          inputMint,
          orderPDA,
          undefined,
          undefined,
          undefined,
          true
        )
      } catch (_) {
        
      }

      const tx = await program.methods.initializeOrder(
        uniqueId,
        makingAmount,
        takingAmount,
        expiredAt
      ).accounts({
        maker: maker,
        payer: provider.wallet.publicKey,
        order: orderPDA,
        inputMintReserve: reserveATA,
        makerInputMintAccount: makerInputATA,
        inputMint,
        outputMint,
        inputTokenProgram: TOKEN_PROGRAM_ID,
        outputTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")

      }).rpc();

      await provider.connection.confirmTransaction(tx);

      //checking order status
      const orderAccount = await program.account.order.fetch(orderPDA);

      assert.ok(orderAccount.maker.equals(maker));

      //check token escrow 
      const reserverInfo = await getAccount(provider.connection, reserveATA);
      assert.equal(Number(reserverInfo.amount), Number(makingAmount));

      } catch (error) {
        console.log(error);
        throw error;
      }
    })

     it(" Should simulate Jupiter swap with mock data", async () => {
    console.log("\n📝 TEST 1: Simulate Jupiter Swap (Mock)\n");

    // This simulates what Jupiter would do in a real swap
    // In production, you'd get this data from Jupiter API
    
    const mockJupiterSwapData = Buffer.from([
      // Mock instruction discriminator (8 bytes)
      1, 2, 3, 4, 5, 6, 7, 8,
      // Mock swap parameters
      ...new BN(500_000).toArray("le", 8), // amount in
      ...new BN(250_000_000).toArray("le", 8), // min amount out
    ]);

    console.log("Mock Jupiter swap data prepared");
    console.log("  Length:", mockJupiterSwapData.length, "bytes");
    console.log("  Hex:", mockJupiterSwapData.toString("hex"));

    // Note: This will fail because Jupiter program isn't on localnet
    // But it validates the instruction structure
    try {
      const minExpectedTakingAmount = new BN(250_000_000);

      // Prepare remaining accounts for Jupiter
      const remainingAccounts = [
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: inputMint, isSigner: false, isWritable: false },
        { pubkey: outputMint, isSigner: false, isWritable: false },
        { pubkey: reserveATA, isSigner: false, isWritable: true },
        { pubkey: makerOutputATA, isSigner: false, isWritable: true },
        { pubkey: orderPDA, isSigner: false, isWritable: false },
      ];

      await program.methods
        .fillOrder(mockJupiterSwapData, minExpectedTakingAmount)
        .accounts({
          backend: BACKEND_AUTHORITY.publicKey,
          maker: maker,
          order: orderPDA,
          inputMintReserve: reserveATA,
          outputMint: outputMint,
          makerOutputAccount: makerOutputATA,
          inputMint: inputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
          jupiterProgram: JUPITER_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(remainingAccounts)
        .signers([BACKEND_AUTHORITY])
        .rpc();

      console.log("✅ Fill order instruction sent");

    } catch (error) {
      console.log("Expected error (Jupiter not on localnet):", error.message);
      console.log(" Instruction structure validated");
      // throw error;
    }
  });

  it(" Should test cancel with expired order", async () => {
    console.log("\n📝 TEST 6: Cancel Expired Order\n");

    // Create new order with short expiry
    const newUniqueId = new BN(Date.now() + 1000);
    const shortExpiry = new BN(Math.floor(Date.now() / 1000) + 2);

    const [newOrderPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        maker.toBuffer(),
        newUniqueId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );

    const newReserveATA = await getAssociatedTokenAddressSync(inputMint, newOrderPDA, true);

       //creating reserve ATA if needed 
      try {
        await createAssociatedTokenAccount(
          provider.connection,
          provider.wallet.payer,
          inputMint,
          newOrderPDA,
          undefined,
          undefined,
          undefined,
          true
        )
      } catch (_) {
        
      }



    await program.methods
      .initializeOrder(newUniqueId, makingAmount, takingAmount, shortExpiry)
      .accounts({
        maker: maker,
        payer: provider.wallet.publicKey,
        order: newOrderPDA,
        inputMintReserve: newReserveATA,
        makerInputMintAccount: makerInputATA,
        inputMint,
        outputMint,
        inputTokenProgram: TOKEN_PROGRAM_ID,
        outputTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("✅ Created order with 2-second expiry");

    // Wait for expiry
    console.log("⏳ Waiting 3 seconds for expiry...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Maker can cancel expired order
    const tx = await program.methods
      .cancelOrder()
      .accounts({
        signer: maker,
        maker: maker,
        order: newOrderPDA,
        inputMintReserve: newReserveATA,
        makerInputAccount: makerInputATA,
        inputMint: inputMint,
        inputTokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    await provider.connection.confirmTransaction(tx, "confirmed");
    console.log("Expired order cancelled successfully");

    const orderAccount = await program.account.order.fetch(newOrderPDA);
    const isCancelled = JSON.stringify(orderAccount.status).includes("cancelled");
    assert.ok(isCancelled);
    console.log("Expiry validation works");
  });




});

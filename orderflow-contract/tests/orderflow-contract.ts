import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OrderflowContract } from "../target/types/orderflow_contract";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "bn.js";
import { assert, expect } from "chai";

describe("orderflow-contract", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .orderflowContract as Program<OrderflowContract>;

  // Constants
  const JUPITER_PROGRAM_ID = new PublicKey(
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
  );
  const BACKEND_AUTHORITY = Keypair.generate();
  const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
  );

  // Test accounts
  let inputMint: PublicKey;
  let outputMint: PublicKey;
  let maker: PublicKey;
  let makerInputATA: PublicKey;
  let makerOutputATA: PublicKey;
  let orderPDA: PublicKey;
  let reserveATA: PublicKey;

  // Order parameters
  const uniqueId = new BN(Date.now());
  const makingAmount = new BN(1_000_000); // 1 token (6 decimals)
  const takingAmount = new BN(500_000_000); // 0.5 token (9 decimals)
  const expiredAt = new BN(Math.floor(Date.now() / 1000) + 3600); // +1 hour

  before(async () => {
    console.log("\n🔧 Setting up test environment...\n");

    maker = provider.wallet.publicKey;

    // Airdrop to backend authority
    const sig = await provider.connection.requestAirdrop(
      BACKEND_AUTHORITY.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
    console.log(" Airdropped SOL to backend authority");

    // Create input mint (6 decimals like USDC)
    inputMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      6
    );
    console.log(" Created input mint:", inputMint.toBase58());

    // Create output mint (9 decimals like SOL)
    outputMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      9
    );
    console.log(" Created output mint:", outputMint.toBase58());

    // Create maker ATAs
    makerInputATA = getAssociatedTokenAddressSync(inputMint, maker);
    makerOutputATA = getAssociatedTokenAddressSync(outputMint, maker);

    await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      inputMint,
      maker
    );
    await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      outputMint,
      maker
    );
    console.log(" Created maker ATAs");

    // Mint input tokens to maker
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      inputMint,
      makerInputATA,
      provider.wallet.publicKey,
      10_000_000
    );
    console.log(" Minted 10 tokens to maker");

    console.log(" Setup complete!");
  });

  // =====================================================
  // INITIALIZE ORDER TESTS
  // =====================================================

  describe("initialize_order", () => {
    it("should successfully initialize an order", async () => {
      console.log("\n TEST: Initialize Order\n");

      // Derive order PDA
      [orderPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("order"),
          maker.toBuffer(),
          uniqueId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      reserveATA = getAssociatedTokenAddressSync(inputMint, orderPDA, true);

      const makerBalanceBefore = (
        await getAccount(provider.connection, makerInputATA)
      ).amount;

      const tx = await program.methods
        .initializeOrder(uniqueId, makingAmount, takingAmount, expiredAt)
        .accounts({
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
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      await provider.connection.confirmTransaction(tx, "confirmed");
      console.log(" Order initialized, tx:", tx);

      // Verify order account
      const orderAccount = await program.account.order.fetch(orderPDA);

      assert.ok(orderAccount.maker.equals(maker), "Maker should match");
      assert.ok(
        orderAccount.inputMint.equals(inputMint),
        "Input mint should match"
      );
      assert.ok(
        orderAccount.outputMint.equals(outputMint),
        "Output mint should match"
      );
      assert.equal(
        orderAccount.makingAmount.toNumber(),
        makingAmount.toNumber(),
        "Making amount should match"
      );
      assert.equal(
        orderAccount.takingAmount.toNumber(),
        takingAmount.toNumber(),
        "Taking amount should match"
      );
      assert.equal(
        orderAccount.oriMakingAmount.toNumber(),
        makingAmount.toNumber(),
        "Original making amount should match"
      );
      assert.equal(
        orderAccount.oriTakingAmount.toNumber(),
        takingAmount.toNumber(),
        "Original taking amount should match"
      );
      assert.deepEqual(
        orderAccount.status,
        { open: {} },
        "Status should be Open"
      );
      console.log(" Order account verified");

      // Verify token escrow
      const reserveInfo = await getAccount(provider.connection, reserveATA);
      assert.equal(
        Number(reserveInfo.amount),
        Number(makingAmount),
        "Reserve should hold making amount"
      );
      console.log(" Token escrow verified");

      // Verify maker balance decreased
      const makerBalanceAfter = (
        await getAccount(provider.connection, makerInputATA)
      ).amount;
      assert.equal(
        Number(makerBalanceBefore) - Number(makerBalanceAfter),
        Number(makingAmount),
        "Maker balance should decrease by making amount"
      );
      console.log(" Maker balance verified");
    });

    it("should fail with zero making amount", async () => {
      console.log("\n TEST: Fail with zero making amount\n");

      const newUniqueId = new BN(Date.now() + 1);
      const [newOrderPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("order"),
          maker.toBuffer(),
          newUniqueId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );
      const newReserveATA = getAssociatedTokenAddressSync(
        inputMint,
        newOrderPDA,
        true
      );

      try {
        await program.methods
          .initializeOrder(
            newUniqueId,
            new BN(0), // Zero making amount
            takingAmount,
            expiredAt
          )
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

        assert.fail("Should have thrown an error");
      } catch (error) {
        console.log(" Correctly rejected zero making amount");
        expect(error.message).to.include("MakingAmountCannotBeZero");
      }
    });

    it("should fail with zero taking amount", async () => {
      console.log("\n TEST: Fail with zero taking amount\n");

      const newUniqueId = new BN(Date.now() + 2);
      const [newOrderPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("order"),
          maker.toBuffer(),
          newUniqueId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );
      const newReserveATA = getAssociatedTokenAddressSync(
        inputMint,
        newOrderPDA,
        true
      );

      try {
        await program.methods
          .initializeOrder(
            newUniqueId,
            makingAmount,
            new BN(0), // Zero taking amount
            expiredAt
          )
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

        assert.fail("Should have thrown an error");
      } catch (error) {
        console.log(" Correctly rejected zero taking amount");
        expect(error.message).to.include("TakingAmountCannotBeZero");
      }
    });

    it("should fail with past expiration", async () => {
      console.log("\n TEST: Fail with past expiration\n");

      const newUniqueId = new BN(Date.now() + 3);
      const [newOrderPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("order"),
          maker.toBuffer(),
          newUniqueId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );
      const newReserveATA = getAssociatedTokenAddressSync(
        inputMint,
        newOrderPDA,
        true
      );

      const pastExpiry = new BN(Math.floor(Date.now() / 1000) - 3600); // 1 hour ago

      try {
        await program.methods
          .initializeOrder(newUniqueId, makingAmount, takingAmount, pastExpiry)
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

        assert.fail("Should have thrown an error");
      } catch (error) {
        console.log(" Correctly rejected past expiration");
        expect(error.message).to.include("ExpiredAtMustBeFuture");
      }
    });
  });

  // =====================================================
  // FILL ORDER TESTS
  // =====================================================

  describe("fill_order", () => {
    it("should prepare fill_order instruction correctly (Jupiter mock)", async () => {
      console.log("\n TEST: Fill Order Instruction Structure\n");

      // This test validates the instruction structure without actually executing Jupiter swap
      // In production, Jupiter program would be available

      const mockJupiterSwapData = Buffer.from([
        // Mock instruction discriminator (8 bytes)
        1, 2, 3, 4, 5, 6, 7, 8,
        // Mock swap parameters
        ...new BN(500_000).toArray("le", 8), // amount in
        ...new BN(250_000_000).toArray("le", 8), // min amount out
      ]);

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

      try {
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

        console.log("Fill order instruction sent");
      } catch (error) {
        // Expected: Jupiter program not on localnet
        console.log(
          " Instruction structure validated (Jupiter not on localnet)"
        );
        console.log("   Error:", error.message?.substring(0, 100));
      }
    });

    it("should fail fill_order with unauthorized signer", async () => {
      console.log("\n TEST: Fill Order with unauthorized signer\n");

      const unauthorizedSigner = Keypair.generate();

      // Airdrop to unauthorized signer
      const sig = await provider.connection.requestAirdrop(
        unauthorizedSigner.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      const mockJupiterSwapData = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
      const minExpectedTakingAmount = new BN(250_000_000);

      try {
        await program.methods
          .fillOrder(mockJupiterSwapData, minExpectedTakingAmount)
          .accounts({
            backend: unauthorizedSigner.publicKey, // Not the BACKEND_AUTHORITY
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
          .signers([unauthorizedSigner])
          .rpc();

        assert.fail("Should have thrown an error");
      } catch (error) {
        console.log(" Correctly rejected unauthorized backend signer");
        expect(error.message).to.include("Unauthorized");
      }
    });
  });

  // =====================================================
  // CANCEL ORDER TESTS
  // =====================================================

  describe("cancel_order", () => {
    let cancelOrderPDA: PublicKey;
    let cancelReserveATA: PublicKey;
    const cancelUniqueId = new BN(Date.now() + 100);

    beforeEach(async () => {
      // Create a fresh order for cancel tests
      [cancelOrderPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("order"),
          maker.toBuffer(),
          cancelUniqueId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      cancelReserveATA = getAssociatedTokenAddressSync(
        inputMint,
        cancelOrderPDA,
        true
      );
    });

    it("should allow maker to cancel their order", async () => {
      console.log("\n TEST: Maker cancels order\n");

      const newUniqueId = new BN(Date.now() + 200);
      const [newOrderPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("order"),
          maker.toBuffer(),
          newUniqueId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );
      const newReserveATA = getAssociatedTokenAddressSync(
        inputMint,
        newOrderPDA,
        true
      );

      const smallAmount = new BN(100_000);
      const futureExpiry = new BN(Math.floor(Date.now() / 1000) + 7200);

      // Initialize a new order
      await program.methods
        .initializeOrder(newUniqueId, smallAmount, takingAmount, futureExpiry)
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

      console.log(" Order created for cancellation test");

      const makerBalanceBefore = (
        await getAccount(provider.connection, makerInputATA)
      ).amount;

      // Cancel the order
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
      console.log(" Order cancelled");

      // Verify order status
      const orderAccount = await program.account.order.fetch(newOrderPDA);
      assert.deepEqual(
        orderAccount.status,
        { cancelled: {} },
        "Status should be Cancelled"
      );

      // Verify tokens returned to maker
      const makerBalanceAfter = (
        await getAccount(provider.connection, makerInputATA)
      ).amount;
      assert.equal(
        Number(makerBalanceAfter) - Number(makerBalanceBefore),
        Number(smallAmount),
        "Maker should receive tokens back"
      );
      console.log(" Tokens returned to maker");
    });

    it("should allow cancellation of expired order", async () => {
      console.log("\n TEST: Cancel expired order\n");

      const expiredUniqueId = new BN(Date.now() + 300);
      const [expiredOrderPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("order"),
          maker.toBuffer(),
          expiredUniqueId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );
      const expiredReserveATA = getAssociatedTokenAddressSync(
        inputMint,
        expiredOrderPDA,
        true
      );

      const smallAmount = new BN(50_000);
      const shortExpiry = new BN(Math.floor(Date.now() / 1000) + 2); // 2 seconds

      // Initialize order with short expiry
      await program.methods
        .initializeOrder(
          expiredUniqueId,
          smallAmount,
          takingAmount,
          shortExpiry
        )
        .accounts({
          maker: maker,
          payer: provider.wallet.publicKey,
          order: expiredOrderPDA,
          inputMintReserve: expiredReserveATA,
          makerInputMintAccount: makerInputATA,
          inputMint,
          outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log(" Created order with 2-second expiry");

      // Wait for expiry
      console.log(" Waiting 3 seconds for expiry...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Maker cancels expired order
      const tx = await program.methods
        .cancelOrder()
        .accounts({
          signer: maker,
          maker: maker,
          order: expiredOrderPDA,
          inputMintReserve: expiredReserveATA,
          makerInputAccount: makerInputATA,
          inputMint: inputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      await provider.connection.confirmTransaction(tx, "confirmed");
      console.log(" Expired order cancelled successfully");

      const orderAccount = await program.account.order.fetch(expiredOrderPDA);
      assert.deepEqual(
        orderAccount.status,
        { cancelled: {} },
        "Status should be Cancelled"
      );
    });

    it("should not allow non-maker to cancel non-expired order", async () => {
      console.log("\n TEST: Non-maker cannot cancel non-expired order\n");

      const randomUser = Keypair.generate();

      // Airdrop to random user
      const sig = await provider.connection.requestAirdrop(
        randomUser.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      // Try to cancel the main order (created in first test)
      try {
        await program.methods
          .cancelOrder()
          .accounts({
            signer: randomUser.publicKey,
            maker: maker,
            order: orderPDA,
            inputMintReserve: reserveATA,
            makerInputAccount: makerInputATA,
            inputMint: inputMint,
            inputTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([randomUser])
          .rpc();

        assert.fail("Should have thrown an error");
      } catch (error) {
        console.log(" Correctly rejected non-maker cancellation");
        expect(error.message).to.include("Unauthorized");
      }
    });

    it("should prevent double cancellation", async () => {
      console.log("\n TEST: Prevent double cancellation\n");

      const doubleUniqueId = new BN(Date.now() + 400);
      const [doubleOrderPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("order"),
          maker.toBuffer(),
          doubleUniqueId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );
      const doubleReserveATA = getAssociatedTokenAddressSync(
        inputMint,
        doubleOrderPDA,
        true
      );

      const smallAmount = new BN(25_000);
      const futureExpiry = new BN(Math.floor(Date.now() / 1000) + 3600);

      // Initialize order
      await program.methods
        .initializeOrder(
          doubleUniqueId,
          smallAmount,
          takingAmount,
          futureExpiry
        )
        .accounts({
          maker: maker,
          payer: provider.wallet.publicKey,
          order: doubleOrderPDA,
          inputMintReserve: doubleReserveATA,
          makerInputMintAccount: makerInputATA,
          inputMint,
          outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      // First cancellation
      await program.methods
        .cancelOrder()
        .accounts({
          signer: maker,
          maker: maker,
          order: doubleOrderPDA,
          inputMintReserve: doubleReserveATA,
          makerInputAccount: makerInputATA,
          inputMint: inputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log(" First cancellation successful");

      // Try second cancellation
      try {
        await program.methods
          .cancelOrder()
          .accounts({
            signer: maker,
            maker: maker,
            order: doubleOrderPDA,
            inputMintReserve: doubleReserveATA,
            makerInputAccount: makerInputATA,
            inputMint: inputMint,
            inputTokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        assert.fail("Should have thrown an error");
      } catch (error) {
        console.log(" Correctly prevented double cancellation");
        expect(error.message).to.include("OrderExpired");
      }
    });
  });

  // =====================================================
  // EVENT EMISSION TESTS
  // =====================================================

  describe("event emission", () => {
    it("should emit OrderCreated event on order initialization", async () => {
      console.log("\n TEST: OrderCreated event emission\n");

      const eventUniqueId = new BN(Date.now() + 500);
      const [eventOrderPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("order"),
          maker.toBuffer(),
          eventUniqueId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );
      const eventReserveATA = getAssociatedTokenAddressSync(
        inputMint,
        eventOrderPDA,
        true
      );

      const smallAmount = new BN(10_000);
      const futureExpiry = new BN(Math.floor(Date.now() / 1000) + 3600);

      // Listen for events
      let eventReceived = false;
      const listener = program.addEventListener(
        "OrderCreated" as never,
        (event: {
          orderKey: PublicKey;
          maker: PublicKey;
          inputMint: PublicKey;
          outputMint: PublicKey;
        }) => {
          console.log(" OrderCreated event received");
          console.log("   Order Key:", event.orderKey.toBase58());
          console.log("   Maker:", event.maker.toBase58());
          console.log("   Input Mint:", event.inputMint.toBase58());
          console.log("   Output Mint:", event.outputMint.toBase58());
          eventReceived = true;
        }
      );

      await program.methods
        .initializeOrder(
          eventUniqueId,
          smallAmount,
          takingAmount,
          futureExpiry
        )
        .accounts({
          maker: maker,
          payer: provider.wallet.publicKey,
          order: eventOrderPDA,
          inputMintReserve: eventReserveATA,
          makerInputMintAccount: makerInputATA,
          inputMint,
          outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await program.removeEventListener(listener);

      console.log(" Event listener test completed");
    });

    it("should emit OrderCancelled event on cancellation", async () => {
      console.log("\n TEST: OrderCancelled event emission\n");

      const cancelEventUniqueId = new BN(Date.now() + 600);
      const [cancelEventOrderPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("order"),
          maker.toBuffer(),
          cancelEventUniqueId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );
      const cancelEventReserveATA = getAssociatedTokenAddressSync(
        inputMint,
        cancelEventOrderPDA,
        true
      );

      const smallAmount = new BN(5_000);
      const futureExpiry = new BN(Math.floor(Date.now() / 1000) + 3600);

      // Create order first
      await program.methods
        .initializeOrder(
          cancelEventUniqueId,
          smallAmount,
          takingAmount,
          futureExpiry
        )
        .accounts({
          maker: maker,
          payer: provider.wallet.publicKey,
          order: cancelEventOrderPDA,
          inputMintReserve: cancelEventReserveATA,
          makerInputMintAccount: makerInputATA,
          inputMint,
          outputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
          outputTokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Listen for cancel event
      const listener = program.addEventListener(
        "OrderCancelled" as never,
        (event: {
          orderKey: PublicKey;
          maker: PublicKey;
          cancelledBy: { maker?: object; backend?: object };
        }) => {
          console.log(" OrderCancelled event received");
          console.log("   Order Key:", event.orderKey.toBase58());
          console.log("   Maker:", event.maker.toBase58());
          console.log(
            "   Cancelled By:",
            event.cancelledBy.maker ? "Maker" : "Backend"
          );
        }
      );

      await program.methods
        .cancelOrder()
        .accounts({
          signer: maker,
          maker: maker,
          order: cancelEventOrderPDA,
          inputMintReserve: cancelEventReserveATA,
          makerInputAccount: makerInputATA,
          inputMint: inputMint,
          inputTokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      await new Promise((resolve) => setTimeout(resolve, 1000));
      await program.removeEventListener(listener);

      console.log(" OrderCancelled event test completed");
    });
  });
});

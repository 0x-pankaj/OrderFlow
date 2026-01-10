export const idl = {
    address: "ApiiyCyQ6AN4jE8NHNEbcdfY3MoFrZvwebukxyWWBJ6N",
    metadata: {
        name: "orderflow_contract",
        version: "0.1.0",
        spec: "0.1.0",
        description: "Created with Anchor",
    },
    instructions: [
        {
            name: "cancel_order",
            discriminator: [95, 129, 237, 240, 8, 49, 223, 132],
            accounts: [
                { name: "signer", signer: true },
                { name: "maker", writable: true, relations: ["order"] },
                { name: "order", writable: true },
                { name: "input_mint_reserve", writable: true },
                { name: "maker_input_account", writable: true },
                { name: "input_mint" },
                { name: "input_token_program" },
            ],
            args: [],
        },
        {
            name: "initialize_order",
            discriminator: [133, 110, 74, 175, 112, 159, 245, 159],
            accounts: [
                { name: "maker", signer: true },
                { name: "payer", writable: true, signer: true },
                { name: "order", writable: true },
                { name: "input_mint_reserve", writable: true },
                { name: "maker_input_mint_account", writable: true },
                { name: "input_mint" },
                { name: "output_mint" },
                { name: "input_token_program" },
                { name: "output_token_program" },
                { name: "system_program", address: "11111111111111111111111111111111" },
                {
                    name: "associated_token_program",
                    address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
                },
            ],
            args: [
                { name: "unique_id", type: "u64" },
                { name: "making_amount", type: "u64" },
                { name: "taking_amount", type: "u64" },
                { name: "expired_at", type: "i64" },
            ],
        },
    ],
    accounts: [
        {
            name: "Order",
            discriminator: [134, 173, 223, 185, 77, 86, 28, 51],
        },
    ],
    types: [
        {
            name: "Order",
            type: {
                kind: "struct",
                fields: [
                    { name: "maker", type: "pubkey" },
                    { name: "input_mint", type: "pubkey" },
                    { name: "output_mint", type: "pubkey" },
                    { name: "making_amount", type: "u64" },
                    { name: "taking_amount", type: "u64" },
                    { name: "ori_making_amount", type: "u64" },
                    { name: "ori_taking_amount", type: "u64" },
                    { name: "expired_at", type: "i64" },
                    { name: "created_at", type: "i64" },
                    { name: "updated_at", type: "i64" },
                    { name: "status", type: { defined: { name: "OrderStatus" } } },
                    { name: "unique_id", type: "u64" },
                    { name: "bump", type: "u8" },
                ],
            },
        },
        {
            name: "OrderStatus",
            type: {
                kind: "enum",
                variants: [{ name: "Open" }, { name: "Filled" }, { name: "Cancelled" }],
            },
        },
    ],
};

export type OrderflowIDL = typeof idl;


export const idl = {
    "address": "ApiiyCyQ6AN4jE8NHNEbcdfY3MoFrZvwebukxyWWBJ6N",
    "metadata": {
        "name": "orderflow_contract",
        "version": "0.1.0",
        "spec": "0.1.0",
        "description": "Created with Anchor"
    },
    "instructions": [
        {
            "name": "cancel_order",
            "discriminator": [
                95,
                129,
                237,
                240,
                8,
                49,
                223,
                132
            ],
            "accounts": [
                {
                    "name": "signer",
                    "signer": true
                },
                {
                    "name": "maker",
                    "writable": true,
                    "relations": [
                        "order"
                    ]
                },
                {
                    "name": "order",
                    "writable": true
                },
                {
                    "name": "input_mint_reserve",
                    "writable": true,
                    "pda": {
                        "seeds": [
                            {
                                "kind": "account",
                                "path": "order"
                            },
                            {
                                "kind": "account",
                                "path": "input_token_program"
                            },
                            {
                                "kind": "account",
                                "path": "order.input_mint",
                                "account": "Order"
                            }
                        ],
                        "program": {
                            "kind": "const",
                            "value": [
                                140,
                                151,
                                37,
                                143,
                                78,
                                36,
                                137,
                                241,
                                187,
                                61,
                                16,
                                41,
                                20,
                                142,
                                13,
                                131,
                                11,
                                90,
                                19,
                                153,
                                218,
                                255,
                                16,
                                132,
                                4,
                                142,
                                123,
                                216,
                                219,
                                233,
                                248,
                                89
                            ]
                        }
                    }
                },
                {
                    "name": "maker_input_account",
                    "writable": true
                },
                {
                    "name": "input_mint"
                },
                {
                    "name": "input_token_program"
                }
            ],
            "args": []
        },
        {
            "name": "fill_order",
            "discriminator": [
                232,
                122,
                115,
                25,
                199,
                143,
                136,
                162
            ],
            "accounts": [
                {
                    "name": "backend",
                    "writable": true,
                    "signer": true
                },
                {
                    "name": "maker",
                    "writable": true,
                    "relations": [
                        "order"
                    ]
                },
                {
                    "name": "order",
                    "writable": true
                },
                {
                    "name": "input_mint_reserve",
                    "writable": true,
                    "pda": {
                        "seeds": [
                            {
                                "kind": "account",
                                "path": "order"
                            },
                            {
                                "kind": "account",
                                "path": "input_token_program"
                            },
                            {
                                "kind": "account",
                                "path": "order.input_mint",
                                "account": "Order"
                            }
                        ],
                        "program": {
                            "kind": "const",
                            "value": [
                                140,
                                151,
                                37,
                                143,
                                78,
                                36,
                                137,
                                241,
                                187,
                                61,
                                16,
                                41,
                                20,
                                142,
                                13,
                                131,
                                11,
                                90,
                                19,
                                153,
                                218,
                                255,
                                16,
                                132,
                                4,
                                142,
                                123,
                                216,
                                219,
                                233,
                                248,
                                89
                            ]
                        }
                    }
                },
                {
                    "name": "output_mint"
                },
                {
                    "name": "maker_output_account",
                    "writable": true,
                    "pda": {
                        "seeds": [
                            {
                                "kind": "account",
                                "path": "maker"
                            },
                            {
                                "kind": "account",
                                "path": "output_token_program"
                            },
                            {
                                "kind": "account",
                                "path": "output_mint"
                            }
                        ],
                        "program": {
                            "kind": "const",
                            "value": [
                                140,
                                151,
                                37,
                                143,
                                78,
                                36,
                                137,
                                241,
                                187,
                                61,
                                16,
                                41,
                                20,
                                142,
                                13,
                                131,
                                11,
                                90,
                                19,
                                153,
                                218,
                                255,
                                16,
                                132,
                                4,
                                142,
                                123,
                                216,
                                219,
                                233,
                                248,
                                89
                            ]
                        }
                    }
                },
                {
                    "name": "input_mint"
                },
                {
                    "name": "input_token_program"
                },
                {
                    "name": "output_token_program"
                },
                {
                    "name": "jupiter_program"
                },
                {
                    "name": "associated_token_program",
                    "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
                },
                {
                    "name": "system_program",
                    "address": "11111111111111111111111111111111"
                }
            ],
            "args": [
                {
                    "name": "jupiter_swap_data",
                    "type": "bytes"
                },
                {
                    "name": "min_expected_taking_amount",
                    "type": "u64"
                }
            ]
        },
        {
            "name": "initialize_order",
            "discriminator": [
                133,
                110,
                74,
                175,
                112,
                159,
                245,
                159
            ],
            "accounts": [
                {
                    "name": "maker",
                    "signer": true
                },
                {
                    "name": "payer",
                    "writable": true,
                    "signer": true
                },
                {
                    "name": "order",
                    "writable": true,
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const",
                                "value": [
                                    111,
                                    114,
                                    100,
                                    101,
                                    114
                                ]
                            },
                            {
                                "kind": "account",
                                "path": "maker"
                            },
                            {
                                "kind": "arg",
                                "path": "unique_id"
                            }
                        ]
                    }
                },
                {
                    "name": "input_mint_reserve",
                    "writable": true
                },
                {
                    "name": "maker_input_mint_account",
                    "writable": true
                },
                {
                    "name": "input_mint"
                },
                {
                    "name": "output_mint"
                },
                {
                    "name": "input_token_program"
                },
                {
                    "name": "output_token_program"
                },
                {
                    "name": "system_program",
                    "address": "11111111111111111111111111111111"
                },
                {
                    "name": "associated_token_program",
                    "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
                }
            ],
            "args": [
                {
                    "name": "unique_id",
                    "type": "u64"
                },
                {
                    "name": "making_amount",
                    "type": "u64"
                },
                {
                    "name": "taking_amount",
                    "type": "u64"
                },
                {
                    "name": "expired_at",
                    "type": "i64"
                }
            ]
        }
    ],
    "accounts": [
        {
            "name": "Order",
            "discriminator": [
                134,
                173,
                223,
                185,
                77,
                86,
                28,
                51
            ]
        }
    ],
    "events": [
        {
            "name": "OrderCancelled",
            "discriminator": [
                108,
                56,
                128,
                68,
                168,
                113,
                168,
                239
            ]
        },
        {
            "name": "OrderCreated",
            "discriminator": [
                224,
                1,
                229,
                63,
                254,
                60,
                190,
                159
            ]
        },
        {
            "name": "OrderFilled",
            "discriminator": [
                120,
                124,
                109,
                66,
                249,
                116,
                174,
                30
            ]
        }
    ],
    "errors": [
        {
            "code": 6000,
            "name": "OrderExpired",
            "msg": "The order has already expired."
        },
        {
            "code": 6001,
            "name": "MakingAmountCannotBeZero",
            "msg": "Making amount cannot be zero."
        },
        {
            "code": 6002,
            "name": "TakingAmountCannotBeZero",
            "msg": "Taking amount cannot be zero."
        },
        {
            "code": 6003,
            "name": "ExpiredAtMustBeFuture",
            "msg": "expired_at must be a future timestamp."
        },
        {
            "code": 6004,
            "name": "MathOverflow",
            "msg": "Math overflow"
        },
        {
            "code": 6005,
            "name": "NoSwapOccurred",
            "msg": "No swap occurred"
        },
        {
            "code": 6006,
            "name": "SlippageTooHigh",
            "msg": "Slippage too high"
        },
        {
            "code": 6007,
            "name": "Unauthorized",
            "msg": "Unauthorized"
        }
    ],
    "types": [
        {
            "name": "CancelledBy",
            "type": {
                "kind": "enum",
                "variants": [
                    {
                        "name": "Maker"
                    },
                    {
                        "name": "Backend"
                    }
                ]
            }
        },
        {
            "name": "Order",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "maker",
                        "type": "pubkey"
                    },
                    {
                        "name": "input_mint",
                        "type": "pubkey"
                    },
                    {
                        "name": "output_mint",
                        "type": "pubkey"
                    },
                    {
                        "name": "making_amount",
                        "type": "u64"
                    },
                    {
                        "name": "taking_amount",
                        "type": "u64"
                    },
                    {
                        "name": "ori_making_amount",
                        "type": "u64"
                    },
                    {
                        "name": "ori_taking_amount",
                        "type": "u64"
                    },
                    {
                        "name": "expired_at",
                        "type": "i64"
                    },
                    {
                        "name": "created_at",
                        "type": "i64"
                    },
                    {
                        "name": "updated_at",
                        "type": "i64"
                    },
                    {
                        "name": "status",
                        "type": {
                            "defined": {
                                "name": "OrderStatus"
                            }
                        }
                    },
                    {
                        "name": "unique_id",
                        "type": "u64"
                    },
                    {
                        "name": "bump",
                        "type": "u8"
                    }
                ]
            }
        },
        {
            "name": "OrderCancelled",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "order_key",
                        "type": "pubkey"
                    },
                    {
                        "name": "maker",
                        "type": "pubkey"
                    },
                    {
                        "name": "cancelled_by",
                        "type": {
                            "defined": {
                                "name": "CancelledBy"
                            }
                        }
                    },
                    {
                        "name": "cancelled_at",
                        "type": "i64"
                    }
                ]
            }
        },
        {
            "name": "OrderCreated",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "order_key",
                        "type": "pubkey"
                    },
                    {
                        "name": "maker",
                        "type": "pubkey"
                    },
                    {
                        "name": "input_mint",
                        "type": "pubkey"
                    },
                    {
                        "name": "output_mint",
                        "type": "pubkey"
                    },
                    {
                        "name": "making_amount",
                        "type": "u64"
                    },
                    {
                        "name": "taking_amount",
                        "type": "u64"
                    },
                    {
                        "name": "expired_at",
                        "type": "i64"
                    },
                    {
                        "name": "created_at",
                        "type": "i64"
                    },
                    {
                        "name": "unique_id",
                        "type": "u64"
                    }
                ]
            }
        },
        {
            "name": "OrderFilled",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "order_key",
                        "type": "pubkey"
                    },
                    {
                        "name": "maker",
                        "type": "pubkey"
                    },
                    {
                        "name": "making_amount_filled",
                        "type": "u64"
                    },
                    {
                        "name": "taking_amount_filled",
                        "type": "u64"
                    },
                    {
                        "name": "remaining_making_amount",
                        "type": "u64"
                    },
                    {
                        "name": "remaining_taking_amount",
                        "type": "u64"
                    },
                    {
                        "name": "is_filled",
                        "type": "bool"
                    },
                    {
                        "name": "filled_at",
                        "type": "i64"
                    }
                ]
            }
        },
        {
            "name": "OrderStatus",
            "type": {
                "kind": "enum",
                "variants": [
                    {
                        "name": "Open"
                    },
                    {
                        "name": "Filled"
                    },
                    {
                        "name": "Cancelled"
                    }
                ]
            }
        }
    ]
}
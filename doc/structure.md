```


   Recovery Key (128-256 bits of entropy)                       Password (weak compared to recovery key)
          |                                                        |
          |HKDF                                                    |
          |                                     +------------------+------------------+
          |                                     |                                     |
  RecoveryvRoot Key                             |Argon2id (password, salt, params)    |OPAQUE
          |                                     |                                     v
          |                                     v                                Session Key
          |                           Password Root Key (PRK)                         |
          |                                                                           |HKDF
          |encrypt and save in backend          |                                     |
          |                                     |encrypt                              v
          |                                     |                              Session Auth Key
          |                                     v
          +--------------------------->Vault Root Key (VRK)                           |
                                                |                                     |HMAC(authKey, method || path || body || nonce)
                                                |HKDF                                 |
                                         +------+------+               Message Authentvcation Code (MAC)
                                         |             |
                                         v             v
                            Vault Data Key (VDK)  Vault Metadata Key (VMK)
```

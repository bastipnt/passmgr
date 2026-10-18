# KDBX test databases

- `keepassxc.kdbx` (KDBX 3.1, AES-KDF; password `correct horse`) and `keyfile-v2.kdbx` (KDBX 3.1, key file `keyfile-v2.keyx`, no
  password): made with `keepassxc-cli` 2.7 (`db-create -t 100`, `mkdir`, `add`).
- `kdbxweb-*`: from [kdbxweb](https://github.com/keeweb/kdbxweb) `resources/`, MIT (`LICENSE.kdbxweb`).
  `demo`, `AesChaCha`, `Argon2`, `Argon2id`: password `demo` + `kdbxweb-demo.key`; `Key32`, `Key64`, `binkey`:
  password `test` + their key file.

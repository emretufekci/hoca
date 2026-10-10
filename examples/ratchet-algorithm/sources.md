# Sources

- Signal, "The Double Ratchet Algorithm" (Perrin, Marlinspike), revision 1, 2016: https://signal.org/docs/specifications/doubleratchet/
  - Symmetric-key ratchet: a KDF chain turns each chain key into a message key and the next chain key; old keys are deleted (forward secrecy).
  - Diffie-Hellman ratchet: new ratchet public keys are exchanged with replies and the DH output is mixed into the root key, restarting the chains (break-in recovery).

The video simplifies: it shows one sending chain and omits the root chain, header encryption and out-of-order message handling.

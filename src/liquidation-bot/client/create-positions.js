const {
    Connection,
    PublicKey,
    Keypair,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction,
  } = require('@solana/web3.js');
  const fs = require('fs');
  
  const PROGRAM_ID = 'your_program_id_here'; // We'll update this after deploying
  
  async function createPosition() {
    // Connect to devnet
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Load your wallet from existing wallet.json
    const wallet = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync('../../../wallet.json', 'utf-8')))
    );
  
    // Create account for position
    const positionAccount = Keypair.generate();
    
    const createPositionIx = new TransactionInstruction({
      programId: new PublicKey(PROGRAM_ID),
      keys: [
        { pubkey: positionAccount.publicKey, isSigner: true, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      ],
      data: Buffer.from([0]) // CreatePosition instruction
    });
  
    const tx = new Transaction().add(createPositionIx);
    
    try {
      const txid = await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet, positionAccount]
      );
      
      console.log('Created position:', txid);
      console.log('Position account:', positionAccount.publicKey.toString());
    } catch (err) {
      console.error('Error:', err);
    }
  }
  
  createPosition().catch(console.error);
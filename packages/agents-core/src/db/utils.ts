import * as readline from 'node:readline';

export const isLocalhostUrl = (url: string | undefined): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1'
    );
  } catch {
    return url.includes('localhost') || url.includes('127.0.0.1');
  }
};

export const askConfirmation = (question: string): Promise<boolean> => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  };
  
  
  export const confirmMigration = async (connectionString: string | undefined) => {
    if (!connectionString) {
      console.error('❌ Error: Database URL is not set.');
      process.exit(1);
    }
  
    if (!isLocalhostUrl(connectionString)) {
      console.warn(
        '⚠️  Warning: Database URL is not pointing to localhost. This operation may modify a production database.' 
      );
  
      const confirmed = await askConfirmation('Do you want to proceed? (y/n): ');
      if (!confirmed) {
        console.log('Migration cancelled.');
        process.exit(0);
      }
  
      console.log('');
    }
    return true;
  };
  
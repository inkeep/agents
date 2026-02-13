import * as p from '@clack/prompts';
import chalk from 'chalk';
import { LOCAL_REMOTE, type Profile, ProfileError, ProfileManager } from '../utils/profiles';

const profileManager = new ProfileManager();

/**
 * List all profiles and show which one is active
 */
export async function profileListCommand(): Promise<void> {
  try {
    const { profiles, activeProfile } = profileManager.listProfiles();

    if (profiles.length === 0) {
      console.log(chalk.yellow('No profiles configured.'));
      console.log(chalk.gray('Run "inkeep profile add <name>" to create one.'));
      return;
    }

    console.log(chalk.bold('Profiles:\n'));

    for (const profile of profiles) {
      const isActive = profile.name === activeProfile;
      const marker = isActive ? chalk.green('* ') : '  ';
      const name = isActive ? chalk.green.bold(profile.name) : profile.name;

      console.log(`${marker}${name}`);
      console.log(chalk.gray(`    Remote: ${profile.remote.api}`));
      console.log(chalk.gray(`    Environment: ${profile.environment}`));
      console.log(chalk.gray(`    Credential: ${profile.credential}`));
      console.log();
    }
  } catch (error) {
    handleProfileError(error);
  }
}

/**
 * Add a new profile interactively
 */
export async function profileAddCommand(name?: string): Promise<void> {
  try {
    // Get profile name if not provided
    let profileName = name;
    if (!profileName) {
      const result = await p.text({
        message: 'Profile name:',
        placeholder: 'my-profile',
        validate: (value) => {
          if (!value) return 'Profile name is required';
          if (!/^[a-z0-9-]+$/.test(value)) {
            return 'Profile name must be lowercase alphanumeric with hyphens only';
          }
          return undefined;
        },
      });

      if (p.isCancel(result)) {
        p.cancel('Profile creation cancelled');
        process.exit(0);
      }

      profileName = result;
    }

    // Check if profile already exists
    const existing = profileManager.getProfile(profileName);
    if (existing) {
      console.error(chalk.red(`Profile '${profileName}' already exists.`));
      process.exit(1);
    }

    // Select remote type
    const remoteType = await p.select({
      message: 'Remote type:',
      options: [
        { value: 'cloud', label: 'Inkeep Cloud', hint: 'Default cloud deployment' },
        { value: 'local', label: 'Local', hint: 'Local development (localhost)' },
        { value: 'custom', label: 'Custom', hint: 'Self-hosted or staging deployment' },
      ],
    });

    if (p.isCancel(remoteType)) {
      p.cancel('Profile creation cancelled');
      process.exit(0);
    }

    let remote: Profile['remote'];

    if (remoteType === 'cloud') {
      remote = 'cloud';
    } else if (remoteType === 'local') {
      remote = { ...LOCAL_REMOTE };
    } else {
      const api = await p.text({
        message: 'Agents API URL:',
        placeholder: 'https://your-agents-api.example.com',
        validate: (value) => {
          if (!value?.trim()) return 'URL is required';
          try {
            new URL(value);
            return undefined;
          } catch {
            return 'Invalid URL format';
          }
        },
      });

      if (p.isCancel(api)) {
        p.cancel('Profile creation cancelled');
        process.exit(0);
      }

      const manageUi = await p.text({
        message: 'Manage UI URL:',
        placeholder: 'https://your-manage-ui.example.com',
        validate: (value) => {
          if (!value?.trim()) return 'URL is required';
          try {
            new URL(value);
            return undefined;
          } catch {
            return 'Invalid URL format';
          }
        },
      });

      if (p.isCancel(manageUi)) {
        p.cancel('Profile creation cancelled');
        process.exit(0);
      }

      remote = {
        api,
        manageUi,
      };
    }

    // Cloud and custom (self-hosted/staging) default to 'production'; only local dev defaults to 'development'
    const envDefault = remoteType === 'local' ? 'development' : 'production';
    const environment = await p.text({
      message: 'Environment name:',
      placeholder: envDefault,
      initialValue: envDefault,
      validate: (value) => {
        if (!value) return 'Environment is required';
        return undefined;
      },
    });

    if (p.isCancel(environment)) {
      p.cancel('Profile creation cancelled');
      process.exit(0);
    }

    // Generate credential reference name
    let credential: string;

    if (remoteType === 'local') {
      credential = 'none';
    } else {
      const credentialDefault = `inkeep-${profileName}`;
      const credentialInput = await p.text({
        message: 'Credential reference:',
        placeholder: credentialDefault,
        initialValue: credentialDefault,
        validate: (value) => {
          if (!value) return 'Credential reference is required';
          return undefined;
        },
      });

      if (p.isCancel(credentialInput)) {
        p.cancel('Profile creation cancelled');
        process.exit(0);
      }

      credential = credentialInput;
    }

    // Create the profile
    const profile: Profile = {
      remote,
      credential,
      environment,
    };

    profileManager.addProfile(profileName, profile);

    console.log();
    console.log(chalk.green('✓'), `Profile '${chalk.cyan(profileName)}' created successfully.`);

    // Check if credential exists and warn if not (skip for 'none')
    if (credential !== 'none') {
      const credentialExists = await profileManager.checkCredentialExists(credential);
      if (!credentialExists) {
        console.log();
        console.log(chalk.yellow('⚠'), `Credential '${credential}' not found in keychain.`);
        console.log(chalk.gray('  Run "inkeep login" to authenticate and store credentials.'));
      }
    }

    // Ask if user wants to switch to this profile
    const switchProfile = await p.confirm({
      message: `Switch to profile '${profileName}'?`,
      initialValue: false,
    });

    if (!p.isCancel(switchProfile) && switchProfile) {
      profileManager.setActiveProfile(profileName);
      console.log(chalk.green('✓'), `Switched to profile '${chalk.cyan(profileName)}'.`);
    }
  } catch (error) {
    handleProfileError(error);
  }
}

/**
 * Set the active profile
 */
export async function profileUseCommand(name: string): Promise<void> {
  try {
    if (!name) {
      console.error(chalk.red('Profile name is required.'));
      console.log(chalk.gray('Usage: inkeep profile use <name>'));
      process.exit(1);
    }

    profileManager.setActiveProfile(name);
    console.log(chalk.green('✓'), `Switched to profile '${chalk.cyan(name)}'.`);
  } catch (error) {
    handleProfileError(error);
  }
}

/**
 * Display the current active profile details
 */
export async function profileCurrentCommand(): Promise<void> {
  try {
    const profile = profileManager.getActiveProfile();

    console.log(chalk.bold('Active Profile:\n'));
    console.log(chalk.cyan(`  Name: ${profile.name}`));
    console.log();
    console.log(chalk.gray('  Remote URLs:'));
    console.log(`    Agents API: ${profile.remote.api}`);
    console.log(`    Manage UI:  ${profile.remote.manageUi}`);
    console.log();
    console.log(`  Environment: ${profile.environment}`);
    console.log(`  Credential:  ${profile.credential}`);

    // Check if credential exists
    const credentialExists = await profileManager.checkCredentialExists(profile.credential);
    if (!credentialExists) {
      console.log();
      console.log(chalk.yellow('⚠'), `Credential '${profile.credential}' not found in keychain.`);
      console.log(chalk.gray('  Run "inkeep login" to authenticate.'));
    }
  } catch (error) {
    handleProfileError(error);
  }
}

/**
 * Remove a profile
 */
export async function profileRemoveCommand(name: string): Promise<void> {
  try {
    if (!name) {
      console.error(chalk.red('Profile name is required.'));
      console.log(chalk.gray('Usage: inkeep profile remove <name>'));
      process.exit(1);
    }

    // Confirm deletion
    const confirm = await p.confirm({
      message: `Remove profile '${name}'?`,
      initialValue: false,
    });

    if (p.isCancel(confirm) || !confirm) {
      console.log(chalk.gray('Profile removal cancelled.'));
      return;
    }

    profileManager.removeProfile(name);
    console.log(chalk.green('✓'), `Profile '${chalk.cyan(name)}' removed.`);
  } catch (error) {
    handleProfileError(error);
  }
}

/**
 * Handle profile errors with user-friendly messages
 */
function handleProfileError(error: unknown): never {
  if (error instanceof ProfileError) {
    console.error(chalk.red('Error:'), error.message);

    // Provide helpful hints based on error code
    switch (error.code) {
      case 'PROFILE_NOT_FOUND':
        console.log(chalk.gray('\nRun "inkeep profile list" to see available profiles.'));
        break;
      case 'PROFILE_EXISTS':
        console.log(chalk.gray('\nUse a different name or remove the existing profile first.'));
        break;
      case 'ACTIVE_PROFILE_DELETE':
        console.log(chalk.gray('\nRun "inkeep profile use <other-profile>" first.'));
        break;
      case 'VALIDATION_ERROR':
        console.log(chalk.gray('\nCheck your profiles.yaml file for syntax errors.'));
        break;
    }

    process.exit(1);
  }

  // Re-throw unknown errors
  throw error;
}

import { multiselect, isCancel, cancel, note, confirm } from '@clack/prompts';
import chalk from 'chalk';
import semver from 'semver';

/**
 * Update Available Session - Grouped by Patch, Minor, Major updates
 */
export async function updateAvailableSession(packages, config) {
    if (!packages || packages.length === 0) {
        return [];
    }

    // Group packages by update type
    const patchUpdates = packages.filter((p) => {
        const diff = semver.diff(p.currentVersion, p.latestVersion);
        return diff === 'patch';
    });

    const minorUpdates = packages.filter((p) => {
        const diff = semver.diff(p.currentVersion, p.latestVersion);
        return diff === 'minor' || diff === 'preminor';
    });

    const majorUpdates = packages.filter((p) => {
        const diff = semver.diff(p.currentVersion, p.latestVersion);
        return diff === 'major' || diff === 'premajor';
    });

    const selected = [];

    // Patch Updates
    if (patchUpdates.length > 0) {
        console.log('\n' + chalk.cyan.bold(`🔹 Patch Updates (${patchUpdates.length})`));
        console.log(chalk.cyan('   Bug fixes and security patches - Safe to update'));

        const patchChoices = patchUpdates.map((pkg) => ({
            label: `${chalk.bold(pkg.name)}  ${chalk.gray(pkg.currentVersion)} ${chalk.white('→')} ${chalk.green(pkg.latestVersion)}  ${chalk.dim('[PATCH]')}`,
            value: pkg.name,
            hint: `Type: patch`,
        }));

        const patchSelected = await multiselect({
            message: 'Select patch updates (safe):',
            options: patchChoices,
            initialValues: config?.ui?.defaultChecked?.updateAvailable ? patchChoices.map((c) => c.value) : [],
            required: false,
        });

        if (isCancel(patchSelected)) {
            cancel(chalk.red('Operation cancelled.'));
            process.exit(0);
        }

        patchSelected.forEach((name) => {
            const pkg = patchUpdates.find((p) => p.name === name);
            selected.push({ ...pkg, action: 'update' });
        });
    }

    // Minor Updates
    if (minorUpdates.length > 0) {
        console.log('\n' + chalk.yellow.bold(`🔸 Minor Updates (${minorUpdates.length})`));
        console.log(chalk.yellow('   New features added - Backward compatible'));

        const minorChoices = minorUpdates.map((pkg) => ({
            label: `${chalk.bold(pkg.name)}  ${chalk.gray(pkg.currentVersion)} ${chalk.white('→')} ${chalk.yellow(pkg.latestVersion)}  ${chalk.dim('[MINOR]')}`,
            value: pkg.name,
            hint: `Type: minor`,
        }));

        const minorSelected = await multiselect({
            message: 'Select minor updates (relatively safe):',
            options: minorChoices,
            initialValues: config?.ui?.defaultChecked?.updateAvailable ? minorChoices.map((c) => c.value) : [],
            required: false,
        });

        if (isCancel(minorSelected)) {
            cancel(chalk.red('Operation cancelled.'));
            process.exit(0);
        }

        minorSelected.forEach((name) => {
            const pkg = minorUpdates.find((p) => p.name === name);
            selected.push({ ...pkg, action: 'update' });
        });
    }

    // Major Updates
    if (majorUpdates.length > 0) {
        console.log('\n' + chalk.red.bold(`🔶 Major Updates (${majorUpdates.length})`));
        console.log(chalk.red('   ⚠️  Breaking changes possible - Review carefully'));

        const majorChoices = majorUpdates.map((pkg) => ({
            label: `${chalk.bold(pkg.name)}  ${chalk.gray(pkg.currentVersion)} ${chalk.white('→')} ${chalk.red(pkg.latestVersion)}  ${chalk.dim('[MAJOR]')}`,
            value: pkg.name,
            hint: `⚠️  May include breaking changes`,
        }));

        const majorSelected = await multiselect({
            message: 'Select major updates (caution required):',
            options: majorChoices,
            required: false,
        });

        if (isCancel(majorSelected)) {
            cancel(chalk.red('Operation cancelled.'));
            process.exit(0);
        }

        if (majorSelected.length > 0) {
            const confirmMajor = await confirm({
                message: chalk.yellow(`⚠️  Proceed with ${majorSelected.length} major update(s)? Breaking changes may be included.`),
            });

            if (isCancel(confirmMajor) || !confirmMajor) {
                note(chalk.yellow('Skipping major updates.'), 'Info');
            } else {
                majorSelected.forEach((name) => {
                    const pkg = majorUpdates.find((p) => p.name === name);
                    selected.push({ ...pkg, action: 'update' });
                });
            }
        }
    }

    return selected;
}

/**
 * Unused Packages Session - Grouped by confidence level
 */
export async function unusedSession(unusedPackages, config) {
    if (!unusedPackages || unusedPackages.length === 0) {
        return [];
    }

    const highConfidence = unusedPackages.filter((p) => p.confidence === 'high');
    const mediumConfidence = unusedPackages.filter((p) => p.confidence === 'medium');
    const lowConfidence = unusedPackages.filter((p) => p.confidence === 'low');

    const selected = [];

    // High Confidence
    if (highConfidence.length > 0) {
        console.log('\n' + chalk.red.bold(`🗑️  Unused Packages (High Confidence: ${highConfidence.length})`));
        console.log(chalk.red('   Safe to remove'));

        const highChoices = highConfidence.map((pkg) => ({
            label: `${chalk.red(pkg.name)}  ${chalk.gray(pkg.current)}  ${chalk.bgRedBright('[Definitely Unused]')}`,
            value: pkg.name,
        }));

        const highSelected = await multiselect({
            message: 'Select packages to remove:',
            options: highChoices,
            initialValues: config?.ui?.defaultChecked?.unused ? highChoices.map((c) => c.value) : [],
            required: false,
        });

        if (isCancel(highSelected)) {
            cancel(chalk.red('Operation cancelled.'));
            process.exit(0);
        }

        highSelected.forEach((name) => {
            const pkg = highConfidence.find((p) => p.name === name);
            selected.push({ ...pkg, action: 'remove' });
        });
    }

    // Medium Confidence
    if (mediumConfidence.length > 0) {
        console.log('\n' + chalk.yellow.bold(`⚠️  Possibly Unused (Medium Confidence: ${mediumConfidence.length})`));
        console.log(chalk.yellow('   May be used by build tools or tests'));

        const mediumChoices = mediumConfidence.map((pkg) => ({
            label: `${chalk.yellow(pkg.name)}  ${chalk.gray(pkg.current)}  ${chalk.dim('[Possibly Unused]')}`,
            value: pkg.name,
            hint: pkg.hint || 'Verification recommended',
        }));

        const proceedMedium = await confirm({
            message: 'Review medium confidence packages?',
            initialValue: false,
        });

        if (proceedMedium && !isCancel(proceedMedium)) {
            const mediumSelected = await multiselect({
                message: 'Select packages to remove (caution):',
                options: mediumChoices,
                required: false,
            });

            if (!isCancel(mediumSelected)) {
                mediumSelected.forEach((name) => {
                    const pkg = mediumConfidence.find((p) => p.name === name);
                    selected.push({ ...pkg, action: 'remove' });
                });
            }
        }
    }

    return selected;
}

/**
 * Not Installed Packages Session
 */
export async function notInstalledSession(packages, config) {
    if (!packages || packages.length === 0) {
        return [];
    }

    console.log('\n' + chalk.cyan.bold(`📥 Not Installed Packages (${packages.length})`));
    console.log(chalk.cyan('   Declared in package.json but not installed'));

    const choices = packages.map((pkg) => ({
        label: `${chalk.bold(pkg.name)}  ${chalk.cyan('[Not Installed]')}`,
        value: pkg.name,
    }));

    const selected = await multiselect({
        message: 'Select packages to install:',
        options: choices,
        initialValues: config?.ui?.defaultChecked?.notInstalled ? choices.map((c) => c.value) : [],
        required: false,
    });

    if (isCancel(selected)) {
        cancel(chalk.red('Operation cancelled.'));
        process.exit(0);
    }

    return selected.map((name) => {
        const pkg = packages.find((p) => p.name === name);
        return { ...pkg, action: 'install' };
    });
}

/**
 * Latest Packages Session (Optional)
 */
export async function latestSession(packages, config) {
    if (!packages || packages.length === 0) {
        return [];
    }

    const showLatest = await confirm({
        message: `Show already up-to-date packages (${packages.length})?`,
        initialValue: false,
    });

    if (!showLatest || isCancel(showLatest)) {
        return [];
    }

    console.log('\n' + chalk.green.bold(`✅ Up-to-date Packages (${packages.length})`));
    console.log(chalk.dim('   These packages are already at their latest versions'));

    // Display as a simple list, not selectable
    packages.forEach((pkg) => {
        console.log(`   ${chalk.green('✓')} ${chalk.bold(pkg.name)}  ${chalk.gray(pkg.current)}`);
    });

    return [];
}

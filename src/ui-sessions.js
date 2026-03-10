import { multiselect, isCancel, cancel, note, confirm } from '@clack/prompts';
import chalk from 'chalk';
import semver from 'semver';
import { SEVERITY_LEVELS } from './security-checker.js';

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

/**
 * Security Vulnerabilities Session - Grouped by severity level
 */
export async function securitySession(securityResults, config) {
    const { classified, grouped, summary } = securityResults;

    if (summary.total === 0) {
        console.log('\n' + chalk.green.bold('🛡️  Security Scan Complete'));
        console.log(chalk.green('   ✅ No vulnerabilities found!'));
        return [];
    }

    const selected = [];

    // Critical Vulnerabilities
    if (classified[SEVERITY_LEVELS.CRITICAL]?.length > 0) {
        console.log('\n' + chalk.red.bgWhite.bold(`🚨 CRITICAL Vulnerabilities (${classified[SEVERITY_LEVELS.CRITICAL].length})`));
        console.log(chalk.red.bold('   ⚠️  IMMEDIATE ACTION REQUIRED - Production Risk!'));

        const criticalChoices = classified[SEVERITY_LEVELS.CRITICAL].map((vuln) => ({
            label: `${chalk.red.bold(vuln.packageName)}  ${chalk.red(vuln.title)}  ${chalk.bgRed.white('[CRITICAL]')}`,
            value: vuln.packageName,
            hint: `CVE: ${vuln.cve || 'N/A'} | ${vuln.description?.substring(0, 50)}...`,
        }));

        const criticalSelected = await multiselect({
            message: chalk.red.bold('Select packages to update (STRONGLY RECOMMENDED):'),
            options: criticalChoices,
            initialValues: config?.security?.autoSelectCritical !== false ? criticalChoices.map((c) => c.value) : [],
            required: false,
        });

        if (isCancel(criticalSelected)) {
            cancel(chalk.red('Operation cancelled.'));
            process.exit(0);
        }

        criticalSelected.forEach((packageName) => {
            const vulns = classified[SEVERITY_LEVELS.CRITICAL].filter(v => v.packageName === packageName);
            selected.push({ packageName, vulnerabilities: vulns, action: 'update', priority: 'critical' });
        });
    }

    // High Vulnerabilities
    if (classified[SEVERITY_LEVELS.HIGH]?.length > 0) {
        console.log('\n' + chalk.red.bold(`⚠️  HIGH Vulnerabilities (${classified[SEVERITY_LEVELS.HIGH].length})`));
        console.log(chalk.yellow('   Recommended to update soon'));

        const highChoices = classified[SEVERITY_LEVELS.HIGH].map((vuln) => ({
            label: `${chalk.red(vuln.packageName)}  ${chalk.yellow(vuln.title)}  ${chalk.bgYellow.black('[HIGH]')}`,
            value: vuln.packageName,
            hint: `CVE: ${vuln.cve || 'N/A'} | ${vuln.description?.substring(0, 50)}...`,
        }));

        const highSelected = await multiselect({
            message: 'Select packages to update (recommended):',
            options: highChoices,
            initialValues: config?.security?.autoSelectHigh !== false ? highChoices.map((c) => c.value) : [],
            required: false,
        });

        if (isCancel(highSelected)) {
            cancel(chalk.red('Operation cancelled.'));
            process.exit(0);
        }

        highSelected.forEach((packageName) => {
            const vulns = classified[SEVERITY_LEVELS.HIGH].filter(v => v.packageName === packageName);
            selected.push({ packageName, vulnerabilities: vulns, action: 'update', priority: 'high' });
        });
    }

    // Moderate Vulnerabilities
    if (classified[SEVERITY_LEVELS.MODERATE]?.length > 0) {
        console.log('\n' + chalk.yellow.bold(`💛 MODERATE Vulnerabilities (${classified[SEVERITY_LEVELS.MODERATE].length})`));
        console.log(chalk.yellow('   Consider updating when convenient'));

        const moderateChoices = classified[SEVERITY_LEVELS.MODERATE].map((vuln) => ({
            label: `${chalk.yellow(vuln.packageName)}  ${vuln.title}  ${chalk.bgYellow.black('[MODERATE]')}`,
            value: vuln.packageName,
            hint: `CVE: ${vuln.cve || 'N/A'} | ${vuln.description?.substring(0, 50)}...`,
        }));

        const moderateSelected = await multiselect({
            message: 'Select packages to update (optional):',
            options: moderateChoices,
            required: false,
        });

        if (isCancel(moderateSelected)) {
            cancel(chalk.red('Operation cancelled.'));
            process.exit(0);
        }

        moderateSelected.forEach((packageName) => {
            const vulns = classified[SEVERITY_LEVELS.MODERATE].filter(v => v.packageName === packageName);
            selected.push({ packageName, vulnerabilities: vulns, action: 'update', priority: 'moderate' });
        });
    }

    // Low Vulnerabilities (설정에 따라 표시)
    if (classified[SEVERITY_LEVELS.LOW]?.length > 0 && config?.security?.showLowPriority !== false) {
        console.log('\n' + chalk.dim.bold(`ℹ️  LOW/INFO Vulnerabilities (${classified[SEVERITY_LEVELS.LOW].length})`));
        console.log(chalk.dim('   Low priority - update when major version changes'));

        const showLow = await confirm({
            message: chalk.dim(`Review low-priority vulnerabilities?`),
            initialValue: false,
        });

        if (showLow && !isCancel(showLow)) {
            const lowChoices = classified[SEVERITY_LEVELS.LOW].map((vuln) => ({
                label: `${chalk.dim(vuln.packageName)}  ${chalk.dim(vuln.title)}  ${chalk.bgGray.black('[LOW]')}`,
                value: vuln.packageName,
                hint: `CVE: ${vuln.cve || 'N/A'} | ${vuln.description?.substring(0, 50)}...`,
            }));

            const lowSelected = await multiselect({
                message: 'Select packages to update (low priority):',
                options: lowChoices,
                required: false,
            });

            if (!isCancel(lowSelected)) {
                lowSelected.forEach((packageName) => {
                    const vulns = classified[SEVERITY_LEVELS.LOW].filter(v => v.packageName === packageName);
                    selected.push({ packageName, vulnerabilities: vulns, action: 'update', priority: 'low' });
                });
            }
        }
    }

    // Final confirmation for critical/high vulnerabilities
    if (selected.some(s => ['critical', 'high'].includes(s.priority)) && selected.length > 0) {
        const confirmSecurity = await confirm({
            message: chalk.green(`🛡️  Proceed with security updates for ${selected.length} package(s)?`),
            initialValue: true,
        });

        if (isCancel(confirmSecurity) || !confirmSecurity) {
            note(chalk.yellow('Security updates skipped. Consider updating manually.'), 'Security Warning');
            return [];
        }
    }

    return selected;
}

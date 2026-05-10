import { multiselect, isCancel, cancel, note, confirm } from '@clack/prompts';
import chalk from 'chalk';
import semver from 'semver';
import { SEVERITY_LEVELS } from './security-checker.js';

const SECURITY_RANK = {
    [SEVERITY_LEVELS.CRITICAL]: 4,
    [SEVERITY_LEVELS.HIGH]: 3,
    [SEVERITY_LEVELS.MODERATE]: 2,
    [SEVERITY_LEVELS.LOW]: 1,
    [SEVERITY_LEVELS.INFO]: 0,
};

function groupDirectVulnerabilities(vulnerabilities = []) {
    const grouped = new Map();

    vulnerabilities
        .filter((vuln) => vuln.direct)
        .forEach((vuln) => {
            if (!grouped.has(vuln.packageName)) {
                grouped.set(vuln.packageName, []);
            }
            grouped.get(vuln.packageName).push(vuln);
        });

    return Array.from(grouped.entries());
}

function getTopSeverity(vulnerabilities = []) {
    return vulnerabilities.reduce((top, vuln) => {
        const severity = vuln.severity || SEVERITY_LEVELS.LOW;
        return SECURITY_RANK[severity] > SECURITY_RANK[top] ? severity : top;
    }, SEVERITY_LEVELS.INFO);
}

function countBySeverity(vulnerabilities = []) {
    return vulnerabilities.reduce((counts, vuln) => {
        const severity = vuln.severity || SEVERITY_LEVELS.LOW;
        counts[severity] = (counts[severity] || 0) + 1;
        return counts;
    }, {});
}

function formatSeverityBreakdown(vulnerabilities = []) {
    const counts = countBySeverity(vulnerabilities);
    return [
        counts[SEVERITY_LEVELS.CRITICAL] ? `${counts[SEVERITY_LEVELS.CRITICAL]} critical` : null,
        counts[SEVERITY_LEVELS.HIGH] ? `${counts[SEVERITY_LEVELS.HIGH]} high` : null,
        counts[SEVERITY_LEVELS.MODERATE] ? `${counts[SEVERITY_LEVELS.MODERATE]} moderate` : null,
        counts[SEVERITY_LEVELS.LOW] ? `${counts[SEVERITY_LEVELS.LOW]} low` : null,
        counts[SEVERITY_LEVELS.INFO] ? `${counts[SEVERITY_LEVELS.INFO]} info` : null,
    ].filter(Boolean).join(', ');
}

function severityColor(severity) {
    switch (severity) {
        case SEVERITY_LEVELS.CRITICAL:
            return chalk.red.bold;
        case SEVERITY_LEVELS.HIGH:
            return chalk.yellow;
        case SEVERITY_LEVELS.MODERATE:
            return chalk.yellow;
        case SEVERITY_LEVELS.LOW:
        case SEVERITY_LEVELS.INFO:
        default:
            return chalk.dim;
    }
}

function compactSecurityChoice(packageName, vulnerabilities, color) {
    const suffix = vulnerabilities.length > 1 ? ` ${vulnerabilities.length} advisories` : '';
    const breakdown = formatSeverityBreakdown(vulnerabilities);

    return {
        label: `${color(packageName)}${chalk.dim(suffix)}`,
        value: packageName,
        hint: breakdown || 'security update recommended',
    };
}

function getDirectSecurityGroups(securityResults) {
    return groupDirectVulnerabilities(securityResults.vulnerabilities || [])
        .map(([packageName, vulnerabilities]) => ({
            packageName,
            vulnerabilities,
            topSeverity: getTopSeverity(vulnerabilities),
        }))
        .sort((a, b) => {
            const severityDiff = SECURITY_RANK[b.topSeverity] - SECURITY_RANK[a.topSeverity];
            return severityDiff || a.packageName.localeCompare(b.packageName);
        });
}

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
        console.log(chalk.cyan('   Bug fixes and safe updates'));

        const patchChoices = patchUpdates.map((pkg) => ({
            label: `${chalk.bold(pkg.name)}  ${chalk.gray(pkg.currentVersion)} ${chalk.white('→')} ${chalk.green(pkg.latestVersion)}`,
            value: pkg.name,
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
            label: `${chalk.bold(pkg.name)}  ${chalk.gray(pkg.currentVersion)} ${chalk.white('→')} ${chalk.yellow(pkg.latestVersion)}`,
            value: pkg.name,
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
            label: `${chalk.bold(pkg.name)}  ${chalk.gray(pkg.currentVersion)} ${chalk.white('→')} ${chalk.red(pkg.latestVersion)}`,
            value: pkg.name,
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
        console.log(chalk.red('   Likely safe to remove'));

        const highChoices = highConfidence.map((pkg) => ({
            label: `${chalk.red(pkg.name)}  ${chalk.gray(pkg.current)}`,
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

    if (config?.ui?.showCurrentPackages !== true) {
        return [];
    }

    console.log('\n' + chalk.green.bold(`✅ Up-to-date Packages (${packages.length})`));

    // Display as a simple list, not selectable
    packages.forEach((pkg) => {
        console.log(`   ${chalk.green('✓')} ${chalk.bold(pkg.name)}  ${chalk.gray(pkg.current)}`);
    });

    return [];
}

/**
 * Security Vulnerabilities Session - Grouped by severity level
 */
export async function securitySession(securityResults, config, { excludePackages = [] } = {}) {
    const { summary } = securityResults;

    if (summary.total === 0) {
        console.log('\n' + chalk.green.bold('🛡️  Security Scan Complete'));
        console.log(chalk.green('   ✅ No vulnerabilities found!'));
        return [];
    }

    const selected = [];
    const excluded = new Set(excludePackages);
    const directGroups = getDirectSecurityGroups(securityResults)
        .filter((group) => !excluded.has(group.packageName));
    const directTotal = directGroups.length;

    if (directTotal === 0) {
        return [];
    }

    const criticalGroups = directGroups.filter((group) => group.topSeverity === SEVERITY_LEVELS.CRITICAL);
    const highGroups = directGroups.filter((group) => group.topSeverity === SEVERITY_LEVELS.HIGH);
    const moderateGroups = directGroups.filter((group) => group.topSeverity === SEVERITY_LEVELS.MODERATE);
    const lowGroups = directGroups.filter((group) =>
        group.topSeverity === SEVERITY_LEVELS.LOW || group.topSeverity === SEVERITY_LEVELS.INFO
    );

    // Critical Vulnerabilities
    if (criticalGroups.length > 0) {
        console.log('\n' + chalk.red.bold(`Security Risk: Critical (${criticalGroups.length})`));
        console.log(chalk.red('   Update immediately'));

        const criticalChoices = criticalGroups.map(({ packageName, vulnerabilities }) =>
            compactSecurityChoice(packageName, vulnerabilities, chalk.red.bold)
        );

        const criticalSelected = await multiselect({
            message: chalk.red.bold('Select critical updates:'),
            options: criticalChoices,
            initialValues: config?.security?.autoSelectCritical !== false ? criticalChoices.map((c) => c.value) : [],
            required: false,
        });

        if (isCancel(criticalSelected)) {
            cancel(chalk.red('Operation cancelled.'));
            process.exit(0);
        }

        criticalSelected.forEach((packageName) => {
            const group = criticalGroups.find((item) => item.packageName === packageName);
            selected.push({ packageName, vulnerabilities: group.vulnerabilities, action: 'update', priority: 'critical' });
        });
    }

    // High Vulnerabilities
    if (highGroups.length > 0) {
        console.log('\n' + chalk.yellow.bold(`Security Risk: High (${highGroups.length})`));
        console.log(chalk.yellow('   Update recommended'));

        const highChoices = highGroups.map(({ packageName, vulnerabilities }) =>
            compactSecurityChoice(packageName, vulnerabilities, chalk.yellow)
        );

        const highSelected = await multiselect({
            message: 'Select high priority updates:',
            options: highChoices,
            initialValues: config?.security?.autoSelectHigh !== false ? highChoices.map((c) => c.value) : [],
            required: false,
        });

        if (isCancel(highSelected)) {
            cancel(chalk.red('Operation cancelled.'));
            process.exit(0);
        }

        highSelected.forEach((packageName) => {
            const group = highGroups.find((item) => item.packageName === packageName);
            selected.push({ packageName, vulnerabilities: group.vulnerabilities, action: 'update', priority: 'high' });
        });
    }

    // Moderate Vulnerabilities
    if (moderateGroups.length > 0) {
        console.log('\n' + chalk.yellow.bold(`Security Risk: Moderate (${moderateGroups.length})`));
        console.log(chalk.yellow('   Review when convenient'));

        const moderateChoices = moderateGroups.map(({ packageName, vulnerabilities }) =>
            compactSecurityChoice(packageName, vulnerabilities, chalk.yellow)
        );

        const moderateSelected = await multiselect({
            message: 'Select moderate updates:',
            options: moderateChoices,
            required: false,
        });

        if (isCancel(moderateSelected)) {
            cancel(chalk.red('Operation cancelled.'));
            process.exit(0);
        }

        moderateSelected.forEach((packageName) => {
            const group = moderateGroups.find((item) => item.packageName === packageName);
            selected.push({ packageName, vulnerabilities: group.vulnerabilities, action: 'update', priority: 'moderate' });
        });
    }

    // Low Vulnerabilities (설정에 따라 표시)
    if (lowGroups.length > 0 && config?.security?.showLowPriority !== false) {
        console.log('\n' + chalk.dim.bold(`Security Risk: Low (${lowGroups.length})`));

        const showLow = await confirm({
            message: chalk.dim(`Review low-priority vulnerabilities?`),
            initialValue: false,
        });

        if (showLow && !isCancel(showLow)) {
            const lowChoices = lowGroups.map(({ packageName, vulnerabilities, topSeverity }) =>
                compactSecurityChoice(packageName, vulnerabilities, severityColor(topSeverity))
            );

            const lowSelected = await multiselect({
                message: 'Select packages to update (low priority):',
                options: lowChoices,
                required: false,
            });

            if (!isCancel(lowSelected)) {
                lowSelected.forEach((packageName) => {
                    const group = lowGroups.find((item) => item.packageName === packageName);
                    selected.push({ packageName, vulnerabilities: group.vulnerabilities, action: 'update', priority: 'low' });
                });
            }
        }
    }

    return selected;
}

#!/usr/bin/env node

// Simple script to help update development tracking files
// Run with: node update-dev-log.js "Description of change"

const fs = require('fs');
const path = require('path');

const changelogPath = path.join(__dirname, 'CHANGELOG.md');
const devLogPath = path.join(__dirname, 'DEVELOPMENT.md');

function getCurrentDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function updateChangelog(description) {
  // Read current changelog
  let content = fs.readFileSync(changelogPath, 'utf8');

  // Find the [Unreleased] section
  const unreleasedRegex = /## \[Unreleased\]((?:(?!## \[).)*)/s;
  const match = content.match(unreleasedRegex);

  if (match) {
    const unreleasedSection = match[1];
    const updatedSection = unreleasedSection.trim() ?
      unreleasedSection.replace(/\n$/, '') + `\n- ${description}\n` :
      `\n- ${description}\n`;

    content = content.replace(unreleasedRegex, `## [Unreleased]${updatedSection}`);
    fs.writeFileSync(changelogPath, content);
    console.log('Updated CHANGELOG.md');
  } else {
    console.log('Could not find [Unreleased] section in CHANGELOG.md');
  }
}

function updateDevelopmentLog(description) {
  // Read current development log
  let content = fs.readFileSync(devLogPath, 'utf8');

  // Find the Current Tasks section
  const tasksRegex = /(## Ongoing Development\n\n### Recently Completed\n(?:- \[x\] .*\n)*\n### Current Tasks\n)((?:- \[ \] .*\n)*)/;
  const match = content.match(tasksRegex);

  if (match) {
    const beforeTasks = match[1];
    const currentTasks = match[2];
    const updatedTasks = `- [ ] ${description}\n${currentTasks}`;

    content = content.replace(tasksRegex, `${beforeTasks}${updatedTasks}`);
    fs.writeFileSync(devLogPath, content);
    console.log('Updated DEVELOPMENT.md');
  } else {
    console.log('Could not find Current Tasks section in DEVELOPMENT.md');
  }
}

// Main execution
if (process.argv.length < 3) {
  console.log('Usage: node update-dev-log.js "Description of change"');
  process.exit(1);
}

const description = process.argv[2];
const timestamp = getCurrentDate();
const datedDescription = `${description} (${timestamp})`;

updateChangelog(datedDescription);
updateDevelopmentLog(description);

console.log(`\nAdded to development logs:
- ${datedDescription}`);
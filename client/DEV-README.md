# Development Tracking

This directory contains files to help track the development of the Ledger expense tracker project.

## Files Overview

### CHANGELOG.md
- Tracks all notable changes to the project
- Follows the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format
- Updated when features are added, changed, or fixed

### DEVELOPMENT.md
- Development guide with project overview and architecture
- Tracks ongoing work and future improvements
- Contains setup instructions and troubleshooting tips

### TODO.md
- Immediate tasks and feature ideas
- Short-term and long-term improvements
- Bug fixes and technical improvements

### VERSION.md
- Version history and roadmap
- Current development status
- Links to other tracking files

### update-dev-log.js / update-dev-log.ps1
- Helper scripts to easily update tracking files
- Adds entries to CHANGELOG.md and DEVELOPMENT.md
- Usage:
  - Node.js: `node update-dev-log.js "Description of change"`
  - PowerShell: `.\update-dev-log.ps1 "Description of change"`

## Usage Guidelines

1. **When adding new features:**
   - Add a brief description to CHANGELOG.md under [Unreleased]
   - Update DEVELOPMENT.md if it affects architecture or setup
   - Add related tasks to TODO.md for future enhancements

2. **When fixing bugs:**
   - Add to CHANGELOG.md under [Unreleased] in the Fixed section
   - Move completed items from TODO.md as needed

3. **When making improvements:**
   - Document in CHANGELOG.md under Changed section
   - Update DEVELOPMENT.md with any important implementation details

4. **For regular updates:**
   - Use the update scripts to maintain consistency
   - Add date stamps to entries for better tracking

## Benefits

These files help maintain context across development sessions by:
- Documenting what has been implemented
- Tracking what still needs to be done
- Providing a history of changes for debugging
- Helping new contributors understand the project
- Maintaining a roadmap for future development

## Maintenance Tips

- Update these files regularly during development
- Keep descriptions concise but informative
- Move completed TODO items to CHANGELOG when appropriate
- Update VERSION.md when releasing new versions
- Use the helper scripts for consistency
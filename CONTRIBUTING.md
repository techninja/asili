# Contributing to Asili

Thank you for your interest in contributing to Asili! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Respect privacy and security considerations
- No discrimination or harassment

## Getting Started

### Prerequisites

- Node.js 22+ and pnpm
- Docker and Docker Compose
- Git

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/asili.git
cd asili

# Install dependencies
pnpm install

# Start development environment
docker compose up -d

# Access the app at http://localhost:4242
```

## Project Structure

```
asili/
├── apps/
│   ├── web/              # Browser-based web app
│   └── calc/             # Calculation server
├── packages/
│   ├── core/             # Shared genomic processing library
│   └── pipeline/         # Data pipeline (ETL)
├── data_out/             # Generated Parquet files (gitignored)
├── cache/                # PGS Catalog cache (gitignored)
└── server-data/          # Server storage (gitignored)
```

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in Issues
2. Create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Browser/environment details
   - Screenshots if applicable

### Suggesting Features

1. Check existing issues and discussions
2. Create a new issue with:
   - Clear use case description
   - Why this feature is valuable
   - Proposed implementation (optional)
   - Privacy/security considerations

### Contributing Code

#### 1. Find or Create an Issue

- Look for issues labeled `good first issue` or `help wanted`
- Comment on the issue to claim it
- Discuss approach before starting large changes

#### 2. Fork and Branch

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR_USERNAME/asili.git
cd asili
git checkout -b feature/your-feature-name
```

#### 3. Make Changes

- Follow existing code style
- Add tests for new functionality
- Update documentation as needed
- Keep commits focused and atomic

#### 4. Test Your Changes

```bash
# Run linting
pnpm run lint

# Run formatting
pnpm run format:check

# Test core library
pnpm run test:core

# Test in browser
docker compose up -d
# Visit http://localhost:4242
```

#### 5. Commit and Push

```bash
# Use conventional commit messages
git commit -m "feat: add support for MyHeritage DNA format"
git commit -m "fix: correct chromosome X handling in parser"
git commit -m "docs: update API documentation"

git push origin feature/your-feature-name
```

#### 6. Create Pull Request

- Fill out the PR template
- Link related issues
- Describe changes and rationale
- Add screenshots for UI changes
- Wait for review and address feedback

## Coding Standards

### JavaScript/Node.js

- Use ES modules (`import`/`export`)
- Use async/await over callbacks
- Prefer `const` over `let`, avoid `var`
- Use descriptive variable names
- Add JSDoc comments for public APIs

```javascript
/**
 * Calculate polygenic risk score for a trait
 * @param {string} traitId - MONDO ID of the trait
 * @param {string} individualId - Individual identifier
 * @param {Function} progressCallback - Progress update callback
 * @returns {Promise<Object>} Risk score result
 */
async function calculateRisk(traitId, individualId, progressCallback) {
  // Implementation
}
```

### Web Components

- Use vanilla Web Components (no framework)
- Keep components focused and reusable
- Use shadow DOM for encapsulation
- Emit custom events for communication

### Error Handling

- Always handle errors gracefully
- Provide user-friendly error messages
- Log errors with context for debugging
- Never expose sensitive data in errors

### Privacy & Security

- Never log or transmit user DNA data
- Validate all user inputs
- Use secure random for IDs
- Document privacy implications of changes

## Areas for Contribution

### High Priority

- **DNA Format Parsers:** Add support for new DNA testing providers
- **Testing:** Unit tests, integration tests, E2E tests
- **Documentation:** User guides, API docs, tutorials
- **Performance:** Optimize parsing and calculation speed
- **Accessibility:** ARIA labels, keyboard navigation, screen reader support

### Medium Priority

- **UI/UX:** Improve design and user experience
- **Trait Curation:** Validate and improve trait descriptions
- **Error Handling:** Better error messages and recovery
- **Internationalization:** Multi-language support

### Advanced

- **Mobile App:** React Native companion app
- **Advanced Analytics:** Trait correlations, family analysis
- **Export Features:** PDF reports, data export
- **Integration:** Health tracking apps, research platforms

## DNA Format Parsers

Adding support for a new DNA testing provider:

1. Create parser in `packages/core/src/genomic-processor/parsers/`
2. Implement format detection
3. Handle chromosome naming (1-22, X, Y, MT)
4. Support both build 37 and 38 (if applicable)
5. Add tests with sample data
6. Update documentation

Example parser structure:

```javascript
export class MyHeritageParser {
  static detect(content) {
    // Return true if this is a MyHeritage file
  }

  static async parse(file, progressCallback) {
    // Parse file and return variants
    return {
      variants: [...],
      metadata: { provider: 'MyHeritage', build: 'hg38' }
    };
  }
}
```

## Testing Guidelines

### Unit Tests

- Test individual functions in isolation
- Mock external dependencies
- Cover edge cases and error conditions
- Aim for >80% code coverage

### Integration Tests

- Test component interactions
- Use real (but small) test data
- Verify end-to-end workflows
- Test error recovery

### Performance Tests

- Benchmark critical operations
- Test with realistic data sizes
- Monitor memory usage
- Prevent performance regressions

## Documentation

### Code Documentation

- JSDoc for all public APIs
- Inline comments for complex logic
- README in each package
- Architecture decision records (ADRs)

### User Documentation

- Getting started guides
- Feature tutorials
- FAQ and troubleshooting
- Privacy and security explanations

## Release Process

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create git tag: `git tag v1.0.0`
4. Push tag: `git push origin v1.0.0`
5. GitHub Actions builds and publishes

## Questions?

- Open a discussion on GitHub
- Check existing documentation
- Ask in pull request comments

## License

By contributing, you agree that your contributions will be licensed under the AGPLv3 License.

**What this means:**
- Your contributions will be open source and freely available
- Anyone using your code must also keep their modifications open source
- This protects the community from proprietary forks
- You retain copyright to your contributions

---

Thank you for helping make Asili better! 🧬

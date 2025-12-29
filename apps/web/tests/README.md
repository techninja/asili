# Asili Frontend Testing Framework

Headless Chrome testing framework for validating DNA file processing and polygenic risk score calculations.

## Setup

```bash
npm install
```

## Test Data

Place your DNA file in `test-data/AncestryDNA.txt` (already copied from root).

## Running Tests

### Full Test Suite
```bash
npm test
```

Tests:
- DNA file loading and parsing
- Local storage persistence
- Type 2 diabetes risk calculation
- Cross-session data retention

### Clear Storage
```bash
npm run test:clear
```

Clears all browser storage for fresh testing.

## Test Features

- **Headless Chrome**: Real browser environment
- **Local Storage**: Persistent data across sessions  
- **DNA Processing**: Validates variant parsing and storage
- **Risk Calculation**: Tests polygenic score computation
- **Error Handling**: Comprehensive error reporting

## Development

Start the webapp first:
```bash
npm run dev
```

Then run tests in another terminal:
```bash
npm test
```

The tests will open a browser window with DevTools for debugging.
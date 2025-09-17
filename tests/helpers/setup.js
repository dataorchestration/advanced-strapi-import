const fs = require('fs');
const path = require('path');

// Mock Strapi global
global.strapi = {
  contentTypes: {
    'api::country.country': {
      info: { singularName: 'country', pluralName: 'countries', displayName: 'Country' },
      attributes: {
        name: { type: 'string', required: true },
        code: { type: 'string', unique: true }
      }
    },
    'api::company.company': {
      info: { singularName: 'company', pluralName: 'companies', displayName: 'Company' },
      attributes: {
        name: { type: 'string', required: true },
        country: { type: 'relation', relation: 'manyToOne', target: 'api::country.country' },
        established: { type: 'integer' },
        active: { type: 'boolean', default: true }
      }
    }
  },
  entityService: {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    findOne: jest.fn()
  },
  service: jest.fn(),
  plugin: jest.fn(() => ({
    service: jest.fn()
  })),
  components: {
    'test.address': {
      attributes: {
        street: { type: 'string' },
        city: { type: 'string' },
        country: { type: 'relation', relation: 'manyToOne', target: 'api::country.country' }
      }
    }
  }
};

// Clean up temp files after tests
afterEach(() => {
  const tempDir = '/tmp';
  const files = fs.readdirSync(tempDir).filter(file => 
    file.startsWith('csv_test_') || file.startsWith('zip_extract_') || file.startsWith('media_zip_')
  );
  files.forEach(file => {
    try {
      fs.unlinkSync(path.join(tempDir, file));
    } catch (err) {
      // Ignore cleanup errors
    }
  });
});

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
// Test CSV data for various scenarios
const testCsvData = {
  validCountries: [
    { name: 'India', code: 'IN' },
    { name: 'United States', code: 'US' },
    { name: 'China', code: 'CN' }
  ],
  
  validCompanies: [
    { name: 'Company A', country: 'India', established: '2010', active: 'true' },
    { name: 'Company B', country: 'United States', established: '1995', active: 'false' },
    { name: 'Company C', country: 'China', established: '2005', active: 'yes' }
  ],
  
  invalidCompanies: [
    { name: '', country: 'India', established: 'invalid', active: 'maybe' }, // missing required, invalid types
    { name: 'Company D', country: 'Unknown Country', established: '2020', active: 'true' } // invalid relation
  ],
  
  companiesWithRelations: [
    { name: 'Relational Company A', 'country.name': 'India', established: '2010', active: 'true' },
    { name: 'Relational Company B', 'country.code': 'US', established: '1995', active: 'false' }
  ]
};

const mockContentTypes = {
  country: {
    uid: 'api::country.country',
    info: {
      singularName: 'country',
      pluralName: 'countries',
      displayName: 'Country'
    },
    attributes: {
      name: { type: 'string', required: true },
      code: { type: 'string', unique: true }
    }
  },

  company: {
    uid: 'api::company.company',
    info: {
      singularName: 'company',
      pluralName: 'companies',
      displayName: 'Company'
    },
    attributes: {
      name: { type: 'string', required: true },
      country: { type: 'relation', relation: 'manyToOne', target: 'api::country.country' },
      established: { type: 'integer' },
      active: { type: 'boolean', default: true }
    }
  }
};

// Helper to convert test data to CSV format
const toCsvString = (data) => {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvLines = [headers.join(',')];
  
  data.forEach(row => {
    const values = headers.map(header => {
      const value = row[header];
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvLines.push(values.join(','));
  });
  
  return csvLines.join('\n');
};

module.exports = {
  testCsvData,
  mockContentTypes,
  toCsvString
};
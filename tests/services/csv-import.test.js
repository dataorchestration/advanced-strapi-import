const csvImportService = require('../../server/services/csv-import');
const { testCsvData, mockContentTypes, toCsvString } = require('../fixtures/test-data');

describe('CSV Import Service', () => {
  let service;

  beforeEach(() => {
    // Create service instance with mock strapi
    service = csvImportService({ strapi: global.strapi });
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('getContentTypes', () => {
    it('should return only API content types', () => {
      const result = service.getContentTypes();
      
      expect(result).toBeDefined();
      expect(result.country).toBeDefined();
      expect(result.country.uid).toBe('api::country.country');
      expect(result.country.displayName).toBe('Country');
    });

    it('should exclude non-API content types', () => {
      global.strapi.contentTypes['plugin::upload.file'] = {
        info: { singularName: 'file', displayName: 'File' }
      };
      
      const result = service.getContentTypes();
      
      expect(result.file).toBeUndefined();
    });
  });

  describe('parseCsv', () => {
    it('should parse valid CSV data', async () => {
      const csvString = toCsvString(testCsvData.validCountries);
      const buffer = Buffer.from(csvString);
      
      const result = await service.parseCsv(buffer);
      
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ name: 'India', code: 'IN' });
      expect(result[1]).toEqual({ name: 'United States', code: 'US' });
    });

    it('should handle empty CSV', async () => {
      const buffer = Buffer.from('');
      
      const result = await service.parseCsv(buffer);
      
      expect(result).toEqual([]);
    });

    it('should handle CSV with only headers', async () => {
      const buffer = Buffer.from('name,code');
      
      const result = await service.parseCsv(buffer);
      
      expect(result).toEqual([]);
    });
  });

  describe('validateCsvData', () => {
    it('should validate correct data successfully', async () => {
      const result = await service.validateCsvData(
        testCsvData.validCountries, 
        mockContentTypes.country
      );
      
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toBeDefined();
      expect(result.validData).toHaveLength(3);
      expect(result.validData[0]).toEqual({ name: 'India', code: 'IN' });
    });

    it('should detect missing required fields', async () => {
      const invalidData = [{ code: 'IN' }]; // missing required 'name' field
      
      const result = await service.validateCsvData(
        invalidData, 
        mockContentTypes.country
      );
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.includes('Missing required fields: name'))).toBeTruthy();
    });

    it('should validate data types correctly', async () => {
      const result = await service.validateCsvData(
        testCsvData.validCompanies, 
        mockContentTypes.company
      );
      
      expect(result.errors).toHaveLength(0);
      expect(result.validData[0].established).toBe(2010); // converted to integer
      expect(result.validData[0].active).toBe(true); // converted to boolean
    });

    it('should detect invalid data types', async () => {
      const result = await service.validateCsvData(
        testCsvData.invalidCompanies, 
        mockContentTypes.company
      );
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.includes('must be a number'))).toBeTruthy();
    });

    it('should handle empty CSV data', async () => {
      const result = await service.validateCsvData([], mockContentTypes.country);
      
      expect(result.errors).toContain('CSV file is empty or invalid');
    });

    it('should validate boolean fields correctly', async () => {
      const booleanTestData = [
        { name: 'Test1', active: 'true' },
        { name: 'Test2', active: 'false' },
        { name: 'Test3', active: '1' },
        { name: 'Test4', active: '0' },
        { name: 'Test5', active: 'yes' },
        { name: 'Test6', active: 'no' }
      ];
      
      const result = await service.validateCsvData(
        booleanTestData, 
        mockContentTypes.company
      );
      
      expect(result.errors).toHaveLength(0);
      expect(result.validData[0].active).toBe(true);
      expect(result.validData[1].active).toBe(false);
      expect(result.validData[2].active).toBe(true);
      expect(result.validData[3].active).toBe(false);
      expect(result.validData[4].active).toBe(true);
      expect(result.validData[5].active).toBe(false);
    });

    it('should validate email fields', async () => {
      const emailContentType = {
        attributes: {
          email: { type: 'email', required: true }
        }
      };
      
      const emailData = [
        { email: 'valid@example.com' },
        { email: 'invalid-email' }
      ];
      
      const result = await service.validateCsvData(emailData, emailContentType);
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.includes('must be a valid email'))).toBeTruthy();
      expect(result.validData).toHaveLength(1);
    });
  });

  describe('parseHeaderMapping', () => {
    it('should map regular headers correctly', () => {
      const headers = ['name', 'code', 'established'];
      const attributes = mockContentTypes.country.attributes;
      
      const result = service.parseHeaderMapping(headers, attributes);
      
      expect(result.name.isValid).toBe(true);
      expect(result.name.isDotNotation).toBe(false);
      expect(result.code.isValid).toBe(true);
    });

    it('should handle dot notation headers', () => {
      const headers = ['name', 'country.name', 'country.code'];
      const attributes = mockContentTypes.company.attributes;
      
      const result = service.parseHeaderMapping(headers, attributes);
      
      expect(result['country.name'].isValid).toBe(true);
      expect(result['country.name'].isDotNotation).toBe(true);
      expect(result['country.name'].relationField).toBe('name');
    });

    it('should mark invalid headers', () => {
      const headers = ['name', 'invalid_field'];
      const attributes = mockContentTypes.country.attributes;
      
      const result = service.parseHeaderMapping(headers, attributes);
      
      expect(result.invalid_field.isValid).toBe(false);
    });
  });

  describe('findRelatedEntity', () => {
    beforeEach(() => {
      global.strapi.entityService.findMany.mockResolvedValue([
        { id: 1, name: 'India', code: 'IN' }
      ]);
    });

    it('should find entity by ID', async () => {
      const result = await service.findRelatedEntity('api::country.country', '1');
      
      expect(result).toEqual({ id: 1, name: 'India', code: 'IN' });
      expect(global.strapi.entityService.findMany).toHaveBeenCalledWith(
        'api::country.country',
        expect.objectContaining({ filters: { id: 1 } })
      );
    });

    it('should find entity by specific field', async () => {
      const result = await service.findRelatedEntity('api::country.country', 'India', 'name');
      
      expect(result).toEqual({ id: 1, name: 'India', code: 'IN' });
      expect(global.strapi.entityService.findMany).toHaveBeenCalledWith(
        'api::country.country',
        expect.objectContaining({ 
          filters: { name: { $eqi: 'India' } }
        })
      );
    });

    it('should return null if entity not found', async () => {
      global.strapi.entityService.findMany.mockResolvedValue([]);
      
      const result = await service.findRelatedEntity('api::country.country', 'NonExistent');
      
      expect(result).toBeNull();
    });
  });

  describe('importData', () => {
    beforeEach(() => {
      global.strapi.entityService.create.mockResolvedValue({ id: 1 });
      global.strapi.entityService.update.mockResolvedValue({ id: 1 });
      global.strapi.entityService.findMany.mockResolvedValue([]);
    });

    it('should create new records successfully', async () => {
      const data = [{ name: 'Test Country', code: 'TC' }];
      
      const result = await service.importData('api::country.country', data);
      
      expect(result.created).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(global.strapi.entityService.create).toHaveBeenCalledWith(
        'api::country.country',
        { data: { name: 'Test Country', code: 'TC' } }
      );
    });

    it('should handle upsert mode', async () => {
      global.strapi.entityService.findMany.mockResolvedValue([{ id: 1, name: 'Existing' }]);
      const data = [{ id: 1, name: 'Updated Country', code: 'UC' }];
      
      const result = await service.importData('api::country.country', data, { 
        upsert: true, 
        upsertField: 'id' 
      });
      
      expect(result.updated).toBe(1);
      expect(result.created).toBe(0);
      expect(global.strapi.entityService.update).toHaveBeenCalledWith(
        'api::country.country',
        1,
        { data: { id: 1, name: 'Updated Country', code: 'UC' } }
      );
    });

    it('should handle batch processing', async () => {
      const data = Array.from({ length: 5 }, (_, i) => ({ 
        name: `Country ${i}`, 
        code: `C${i}` 
      }));
      
      const result = await service.importData('api::country.country', data, { 
        batchSize: 2 
      });
      
      expect(result.created).toBe(5);
      expect(global.strapi.entityService.create).toHaveBeenCalledTimes(5);
    });

    it('should handle import errors gracefully', async () => {
      global.strapi.entityService.create.mockRejectedValue(new Error('Database error'));
      const data = [{ name: 'Test Country', code: 'TC' }];
      
      const result = await service.importData('api::country.country', data);
      
      expect(result.created).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Database error');
    });
  });

  describe('processRelations', () => {
    beforeEach(() => {
      global.strapi.entityService.findMany.mockImplementation((uid, options) => {
        if (uid === 'api::country.country' && options.filters.name) {
          return Promise.resolve([{ id: 1, name: 'India', code: 'IN' }]);
        }
        return Promise.resolve([]);
      });
    });

    it('should process relation fields with dot notation', async () => {
      const data = [{
        name: 'Test Company',
        __country_dotNotation: { relationField: 'name', value: 'India' }
      }];
      
      const result = await service.processRelations(data, mockContentTypes.company);
      
      expect(result[0].country).toBe(1);
      expect(result[0].__country_dotNotation).toBeUndefined();
    });

    it('should process direct relation values', async () => {
      global.strapi.entityService.findMany.mockResolvedValue([{ id: 2, name: 'USA' }]);
      const data = [{ name: 'Test Company', country: 'USA' }];
      
      const result = await service.processRelations(data, mockContentTypes.company);
      
      expect(result[0].country).toBe(2);
    });

    it('should handle multiple relations', async () => {
      const multiRelationContentType = {
        attributes: {
          tags: {
            type: 'relation',
            relation: 'manyToMany',
            target: 'api::tag.tag'
          }
        }
      };

      // Mock the target content type
      global.strapi.contentTypes = {
        ...global.strapi.contentTypes,
        'api::tag.tag': {
          attributes: {
            name: { type: 'string' }
          }
        }
      };
      
      global.strapi.entityService.findMany.mockImplementation((uid, options) => {
        // Return different entities based on filter value
        const filterValue = options?.filters ? Object.values(options.filters)[0] : null;
        if (filterValue && (filterValue.$eqi === 'tag1' || filterValue.$containsi === 'tag1')) {
          return Promise.resolve([{ id: 1 }]);
        } else if (filterValue && (filterValue.$eqi === 'tag2' || filterValue.$containsi === 'tag2')) {
          return Promise.resolve([{ id: 2 }]);
        }
        return Promise.resolve([]);
      });
      
      const data = [{ tags: 'tag1,tag2' }];
      
      const result = await service.processRelations(data, multiRelationContentType);

      expect(result[0].tags).toEqual([1, 2]);
    });
  });

  describe('getMimeType', () => {
    it('should return correct MIME types', () => {
      expect(service.getMimeType('test.pdf')).toBe('application/pdf');
      expect(service.getMimeType('image.jpg')).toBe('image/jpeg');
      expect(service.getMimeType('doc.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(service.getMimeType('unknown.xyz')).toBe('application/octet-stream');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed CSV gracefully', async () => {
      const malformedCsv = 'name,code\n"unclosed quote,test';
      const buffer = Buffer.from(malformedCsv);

      // csv-parser is lenient and handles malformed CSV by parsing what it can
      const result = await service.parseCsv(buffer);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle service errors in processRelations', async () => {
      global.strapi.entityService.findMany.mockRejectedValue(new Error('Database error'));
      const data = [{ name: 'Test', country: 'India' }];
      
      const result = await service.processRelations(data, mockContentTypes.company);
      
      // Should continue processing despite errors
      expect(result).toHaveLength(1);
      expect(result[0].country).toBeUndefined();
    });
  });
});
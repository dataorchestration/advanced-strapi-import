const csvImportController = require('../../server/controllers/csv-import');
const { testCsvData, toCsvString } = require('../fixtures/test-data');
const fs = require('fs');
const path = require('path');

describe('CSV Import Controller', () => {
  let controller;
  let mockCtx;
  let mockCsvImportService;

  beforeEach(() => {
    // Mock CSV import service
    mockCsvImportService = {
      getContentTypes: jest.fn(),
      parseCsv: jest.fn(),
      validateCsvData: jest.fn(),
      processRelations: jest.fn(),
      processComponents: jest.fn(),
      importData: jest.fn(),
      extractAndUploadZip: jest.fn(),
      extractAndProcessMediaZip: jest.fn()
    };

    // Mock strapi plugin service
    global.strapi.plugin.mockReturnValue({
      service: jest.fn(() => mockCsvImportService)
    });

    // Create controller instance
    controller = csvImportController({ strapi: global.strapi });

    // Mock Koa context
    mockCtx = {
      params: {},
      request: {
        files: {},
        body: {}
      },
      body: {},
      status: 200,
      set: jest.fn(),
      attachment: jest.fn(),
      type: '',
      throw: jest.fn((status, message) => {
        const error = new Error(message);
        error.status = status;
        throw error;
      })
    };

    // Create temporary test file
    const testCsvContent = toCsvString(testCsvData.validCountries);
    const tempFilePath = path.join('/tmp', 'csv_test_' + Date.now() + '.csv');
    fs.writeFileSync(tempFilePath, testCsvContent);
    
    mockCtx.request.files.file = {
      name: 'test.csv',
      path: tempFilePath,
      type: 'text/csv',
      size: testCsvContent.length
    };
  });

  afterEach(() => {
    // Clean up temp files
    if (mockCtx.request.files.file && fs.existsSync(mockCtx.request.files.file.path)) {
      fs.unlinkSync(mockCtx.request.files.file.path);
    }
  });

  describe('getContentTypes', () => {
    it('should return content types successfully', async () => {
      const mockContentTypes = {
        country: { displayName: 'Country', singularName: 'country' },
        company: { displayName: 'Company', singularName: 'company' }
      };
      mockCsvImportService.getContentTypes.mockReturnValue(mockContentTypes);

      await controller.getContentTypes(mockCtx);

      expect(mockCtx.body).toEqual({
        data: mockContentTypes,
        meta: { count: 2 }
      });
    });

    it('should handle service errors', async () => {
      mockCsvImportService.getContentTypes.mockImplementation(() => {
        throw new Error('Service error');
      });

      await expect(controller.getContentTypes(mockCtx)).rejects.toThrow('Failed to fetch content types: Service error');
    });
  });

  describe('uploadCsv', () => {
    beforeEach(() => {
      mockCtx.params.contentType = 'country';
      mockCsvImportService.getContentTypes.mockReturnValue({
        country: { 
          displayName: 'Country',
          attributes: { name: { type: 'string' } }
        }
      });
    });

    it('should upload and validate CSV successfully', async () => {
      mockCsvImportService.parseCsv.mockResolvedValue(testCsvData.validCountries);
      mockCsvImportService.validateCsvData.mockResolvedValue({
        errors: [],
        warnings: [],
        validData: testCsvData.validCountries
      });

      await controller.uploadCsv(mockCtx);

      expect(mockCtx.body.data.validation.errors).toHaveLength(0);
      expect(mockCtx.body.data.totalRows).toBe(testCsvData.validCountries.length);
      expect(mockCsvImportService.parseCsv).toHaveBeenCalled();
      expect(mockCsvImportService.validateCsvData).toHaveBeenCalled();
    });

    it('should return validation errors', async () => {
      mockCsvImportService.parseCsv.mockResolvedValue(testCsvData.invalidCompanies);
      mockCsvImportService.validateCsvData.mockResolvedValue({
        errors: ['Missing required field: name'],
        warnings: [],
        validData: [],
        invalidRows: testCsvData.invalidCompanies
      });

      await controller.uploadCsv(mockCtx);

      expect(mockCtx.status).toBe(400);
      expect(mockCtx.body.error).toBe('Validation failed');
      expect(mockCtx.body.details.errors).toContain('Missing required field: name');
    });

    it('should handle missing content type', async () => {
      mockCtx.params.contentType = 'nonexistent';

      await expect(controller.uploadCsv(mockCtx)).rejects.toThrow('Content type "nonexistent" not found');
    });

    it('should handle missing file', async () => {
      mockCtx.request.files = {};

      await expect(controller.uploadCsv(mockCtx)).rejects.toThrow('No file uploaded');
    });
  });

  describe('previewCsv', () => {
    beforeEach(() => {
      mockCtx.params.contentType = 'country';
      mockCsvImportService.getContentTypes.mockReturnValue({
        country: { 
          displayName: 'Country',
          attributes: { name: { type: 'string' }, code: { type: 'string' } }
        }
      });
    });

    it('should preview CSV data successfully', async () => {
      mockCsvImportService.parseCsv.mockResolvedValue(testCsvData.validCountries);

      await controller.previewCsv(mockCtx);

      expect(mockCtx.body.data.headers).toEqual(['name', 'code']);
      expect(mockCtx.body.data.totalRows).toBe(3);
      expect(mockCtx.body.data.preview).toEqual(testCsvData.validCountries);
    });

    it('should handle empty CSV preview', async () => {
      mockCsvImportService.parseCsv.mockResolvedValue([]);

      await controller.previewCsv(mockCtx);

      expect(mockCtx.body.data.headers).toEqual([]);
      expect(mockCtx.body.data.totalRows).toBe(0);
    });
  });

  describe('importCsv', () => {
    beforeEach(() => {
      mockCtx.params.contentType = 'country';
      mockCtx.request.body = {
        upsert: 'false',
        batchSize: '100',
        upsertField: 'id'
      };
      
      mockCsvImportService.getContentTypes.mockReturnValue({
        country: { 
          uid: 'api::country.country',
          displayName: 'Country',
          attributes: { name: { type: 'string' }, code: { type: 'string' } }
        }
      });
    });

    it('should import CSV data successfully', async () => {
      mockCsvImportService.parseCsv.mockResolvedValue(testCsvData.validCountries);
      mockCsvImportService.validateCsvData.mockResolvedValue({
        errors: [],
        warnings: [],
        validData: testCsvData.validCountries
      });
      mockCsvImportService.processRelations.mockResolvedValue(testCsvData.validCountries);
      mockCsvImportService.processComponents.mockResolvedValue(testCsvData.validCountries);
      mockCsvImportService.importData.mockResolvedValue({
        created: 3,
        updated: 0,
        errors: []
      });

      await controller.importCsv(mockCtx);

      expect(mockCtx.body.data.created).toBe(3);
      expect(mockCtx.body.data.updated).toBe(0);
      expect(mockCtx.body.data.totalProcessed).toBe(3);
      expect(mockCsvImportService.importData).toHaveBeenCalledWith(
        'api::country.country',
        testCsvData.validCountries,
        expect.objectContaining({
          upsert: false,
          batchSize: '100',
          upsertField: 'id'
        })
      );
    });

    it('should handle validation errors during import', async () => {
      mockCsvImportService.parseCsv.mockResolvedValue(testCsvData.invalidCompanies);
      mockCsvImportService.validateCsvData.mockResolvedValue({
        errors: ['Validation failed'],
        warnings: [],
        validData: [],
        invalidRows: testCsvData.invalidCompanies
      });

      await controller.importCsv(mockCtx);

      expect(mockCtx.status).toBe(400);
      expect(mockCtx.body.error).toBe('Validation failed');
      expect(mockCsvImportService.importData).not.toHaveBeenCalled();
    });

    it('should handle upsert mode', async () => {
      mockCtx.request.body.upsert = 'true';
      mockCtx.request.body.upsertField = 'code';
      
      mockCsvImportService.parseCsv.mockResolvedValue(testCsvData.validCountries);
      mockCsvImportService.validateCsvData.mockResolvedValue({
        errors: [],
        warnings: [],
        validData: testCsvData.validCountries
      });
      mockCsvImportService.processRelations.mockResolvedValue(testCsvData.validCountries);
      mockCsvImportService.processComponents.mockResolvedValue(testCsvData.validCountries);
      mockCsvImportService.importData.mockResolvedValue({
        created: 1,
        updated: 2,
        errors: []
      });

      await controller.importCsv(mockCtx);

      expect(mockCsvImportService.importData).toHaveBeenCalledWith(
        'api::country.country',
        testCsvData.validCountries,
        expect.objectContaining({
          upsert: true,
          upsertField: 'code'
        })
      );
    });

    it('should handle media field mappings', async () => {
      mockCtx.request.body.mediaFieldMappings = JSON.stringify([
        { field: 'image', uploadedFiles: [{ id: 1, name: 'test.jpg' }] }
      ]);

      mockCsvImportService.parseCsv.mockResolvedValue(testCsvData.validCountries);
      mockCsvImportService.validateCsvData.mockResolvedValue({
        errors: [],
        warnings: [],
        validData: testCsvData.validCountries
      });
      mockCsvImportService.processRelations.mockResolvedValue(testCsvData.validCountries);
      mockCsvImportService.processComponents.mockResolvedValue(testCsvData.validCountries);
      mockCsvImportService.importData.mockResolvedValue({
        created: 3,
        updated: 0,
        errors: []
      });

      await controller.importCsv(mockCtx);

      expect(mockCsvImportService.importData).toHaveBeenCalledWith(
        'api::country.country',
        testCsvData.validCountries,
        expect.objectContaining({
          mediaFieldMappings: [
            { field: 'image', uploadedFiles: [{ id: 1, name: 'test.jpg' }] }
          ]
        })
      );
    });
  });

  describe('uploadZip', () => {
    beforeEach(() => {
      mockCtx.request.body = { mediaField: 'documents' };
      mockCtx.request.files.zipFile = {
        name: 'test.zip',
        path: '/tmp/test.zip',
        type: 'application/zip'
      };
    });

    it('should upload ZIP file successfully', async () => {
      const mockUploadedFiles = [
        { id: 1, name: 'file1.pdf', url: '/uploads/file1.pdf' },
        { id: 2, name: 'file2.jpg', url: '/uploads/file2.jpg' }
      ];
      mockCsvImportService.extractAndUploadZip.mockResolvedValue(mockUploadedFiles);

      await controller.uploadZip(mockCtx);

      expect(mockCtx.body.data).toEqual(mockUploadedFiles);
      expect(mockCtx.body.meta.filesUploaded).toBe(2);
      expect(mockCsvImportService.extractAndUploadZip).toHaveBeenCalledWith(
        mockCtx.request.files.zipFile,
        'documents'
      );
    });

    it('should handle missing ZIP file', async () => {
      mockCtx.request.files = {};

      await expect(controller.uploadZip(mockCtx)).rejects.toThrow('No zip file uploaded');
    });
  });

  describe('exportCsv', () => {
    beforeEach(() => {
      mockCtx.params.contentType = 'country';
      mockCtx.request.body = { filters: {} };
      
      mockCsvImportService.getContentTypes.mockReturnValue({
        country: { 
          uid: 'api::country.country',
          displayName: 'Country',
          attributes: { 
            name: { type: 'string' },
            code: { type: 'string' }
          }
        }
      });

      global.strapi.entityService.findMany.mockResolvedValue([
        { id: 1, name: 'India', code: 'IN' },
        { id: 2, name: 'USA', code: 'US' }
      ]);
    });

    it('should export CSV data successfully', async () => {
      await controller.exportCsv(mockCtx);

      expect(mockCtx.body).toContain('id,name,code');
      expect(mockCtx.body).toContain('1,India,IN');
      expect(mockCtx.body).toContain('2,USA,US');
      expect(global.strapi.entityService.findMany).toHaveBeenCalledWith(
        'api::country.country',
        expect.objectContaining({
          filters: {},
          populate: {},
          pagination: { limit: 1000 }
        })
      );
    });

    it('should handle relation fields in export', async () => {
      mockCsvImportService.getContentTypes.mockReturnValue({
        company: { 
          uid: 'api::company.company',
          displayName: 'Company',
          attributes: { 
            name: { type: 'string' },
            country: { type: 'relation', relation: 'manyToOne', target: 'api::country.country' }
          }
        }
      });

      global.strapi.entityService.findMany.mockResolvedValue([
        { 
          id: 1, 
          name: 'Test Company', 
          country: { id: 1, name: 'India', code: 'IN' }
        }
      ]);

      global.strapi.contentTypes['api::country.country'] = {
        attributes: { name: { type: 'string' }, code: { type: 'string' } }
      };

      mockCtx.params.contentType = 'company';

      await controller.exportCsv(mockCtx);

      expect(mockCtx.body).toContain('country.name');
      expect(mockCtx.body).toContain('India');
    });

    it('should handle missing content type for export', async () => {
      mockCtx.params.contentType = 'nonexistent';

      await expect(controller.exportCsv(mockCtx)).rejects.toThrow('Content type "nonexistent" not found');
    });
  });

  describe('Error Handling', () => {
    it('should handle CSV parsing errors', async () => {
      mockCtx.params.contentType = 'country';
      mockCsvImportService.getContentTypes.mockReturnValue({
        country: { displayName: 'Country' }
      });
      mockCsvImportService.parseCsv.mockRejectedValue(new Error('Parse error'));

      await expect(controller.uploadCsv(mockCtx)).rejects.toThrow('Failed to process CSV: Parse error');
    });

    it('should handle import service errors', async () => {
      mockCtx.params.contentType = 'country';
      mockCsvImportService.getContentTypes.mockReturnValue({
        country: { uid: 'api::country.country', displayName: 'Country' }
      });
      mockCsvImportService.parseCsv.mockResolvedValue([]);
      mockCsvImportService.validateCsvData.mockResolvedValue({
        errors: [],
        warnings: [],
        validData: []
      });
      mockCsvImportService.processRelations.mockRejectedValue(new Error('Import error'));

      await expect(controller.importCsv(mockCtx)).rejects.toThrow('Failed to import CSV: Import error');
    });

    it('should handle ZIP upload errors', async () => {
      mockCtx.request.body = { mediaField: 'documents' };
      mockCtx.request.files.zipFile = { name: 'test.zip' };
      mockCsvImportService.extractAndUploadZip.mockRejectedValue(new Error('ZIP error'));

      await expect(controller.uploadZip(mockCtx)).rejects.toThrow('Failed to upload zip file: ZIP error');
    });
  });
});
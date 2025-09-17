'use strict';

module.exports = ({ strapi }) => ({
  /**
   * Get all available content types
   */
  async getContentTypes(ctx) {
    try {
      const contentTypes = strapi.plugin('csv-import').service('csvImport').getContentTypes();
      
      ctx.body = {
        data: contentTypes,
        meta: {
          count: Object.keys(contentTypes).length,
        },
      };
    } catch (error) {
      ctx.throw(500, `Failed to fetch content types: ${error.message}`);
    }
  },

  /**
   * Upload and validate CSV file
   */
  async uploadCsv(ctx) {
    try {
      const { contentType } = ctx.params;
      const csvImportService = strapi.plugin('csv-import').service('csvImport');
      
      // Get content type info
      const contentTypes = csvImportService.getContentTypes();
      const targetContentType = contentTypes[contentType];
      
      if (!targetContentType) {
        ctx.throw(404, `Content type "${contentType}" not found`);
        return;
      }

      // Check if file is present in request
      if (!ctx.request.files || !ctx.request.files.file) {
        ctx.throw(400, 'No file uploaded');
        return;
      }

      const file = ctx.request.files.file;
      const fs = require('fs');
      const fileBuffer = fs.readFileSync(file.path);

      // Parse CSV
      const csvData = await csvImportService.parseCsv(fileBuffer);
      
      // Validate data
      const validation = await csvImportService.validateCsvData(csvData, targetContentType);

      // If validation has errors, return them with appropriate status
      if (validation.errors && validation.errors.length > 0) {
        ctx.status = 400;
        ctx.body = {
          error: 'Validation failed',
          details: {
            errors: validation.errors,
            warnings: validation.warnings,
            invalidRows: validation.invalidRows,
            fileName: file.name,
            totalRows: csvData.length,
          },
        };
        return;
      }

      // If validation passed, return success with preview
      ctx.body = {
        data: {
          contentType: targetContentType,
          validation,
          preview: csvData.slice(0, 5), // First 5 rows for preview
          totalRows: csvData.length,
          fileName: file.name,
        },
      };
    } catch (error) {
      ctx.throw(500, `Failed to process CSV: ${error.message}`);
    }
  },

  /**
   * Preview CSV data without importing
   */
  async previewCsv(ctx) {
    try {
      const { contentType } = ctx.params;
      const csvImportService = strapi.plugin('csv-import').service('csvImport');
      
      // Check if file is present in request
      if (!ctx.request.files || !ctx.request.files.file) {
        ctx.throw(400, 'No file uploaded');
        return;
      }

      const file = ctx.request.files.file;
      const fs = require('fs');
      const fileBuffer = fs.readFileSync(file.path);
      
      // Get content type info
      const contentTypes = csvImportService.getContentTypes();
      const targetContentType = contentTypes[contentType];
      
      if (!targetContentType) {
        ctx.throw(404, `Content type "${contentType}" not found`);
        return;
      }

      // Parse CSV
      const csvData = await csvImportService.parseCsv(fileBuffer);
      
      ctx.body = {
        data: {
          headers: csvData.length > 0 ? Object.keys(csvData[0]) : [],
          preview: csvData.slice(0, 10), // First 10 rows
          totalRows: csvData.length,
          contentTypeAttributes: Object.keys(targetContentType.attributes),
          fileName: file.name,
        },
      };
    } catch (error) {
      ctx.throw(500, `Failed to preview CSV: ${error.message}`);
    }
  },

  /**
   * Upload zip files to media library
   */
  async uploadZip(ctx) {
    try {
      const { mediaField } = ctx.request.body;
      
      // Check if file is present in request
      if (!ctx.request.files || !ctx.request.files.zipFile) {
        ctx.throw(400, 'No zip file uploaded');
        return;
      }

      const zipFile = ctx.request.files.zipFile;
      const csvImportService = strapi.plugin('csv-import').service('csvImport');
      
      // Extract and upload zip files to media library
      const uploadedFiles = await csvImportService.extractAndUploadZip(zipFile, mediaField);
      
      ctx.body = {
        data: uploadedFiles,
        meta: {
          mediaField,
          filesUploaded: uploadedFiles.length,
        },
      };
    } catch (error) {
      ctx.throw(500, `Failed to upload zip file: ${error.message}`);
    }
  },

  /**
   * Upload and process media ZIP file with folder-based organization
   */
  async uploadMediaZip(ctx) {
    try {
      const { contentType, matchField = 'id' } = ctx.request.body;
      const csvImportService = strapi.plugin('csv-import').service('csvImport');
      
      // Check if file is present in request
      if (!ctx.request.files || !ctx.request.files.zipFile) {
        ctx.throw(400, 'No ZIP file uploaded');
        return;
      }

      const zipFile = ctx.request.files.zipFile;
      
      // Get content type info to determine media fields
      const contentTypes = csvImportService.getContentTypes();
      const targetContentType = contentTypes[contentType];
      
      if (!targetContentType) {
        ctx.throw(404, `Content type "${contentType}" not found`);
        return;
      }

      // Extract and organize files from ZIP based on folder structure
      const mediaFieldMappings = await csvImportService.extractAndProcessMediaZip(
        zipFile, 
        targetContentType,
        matchField
      );
      
      ctx.body = {
        data: mediaFieldMappings,
        meta: {
          contentType: contentType,
          matchField: matchField,
          totalMappings: mediaFieldMappings.length,
        },
      };
    } catch (error) {
      ctx.throw(500, `Failed to process media ZIP file: ${error.message}`);
    }
  },

  /**
   * Import CSV data into content type
   */
  async importCsv(ctx) {
    try {
      const { contentType } = ctx.params;
      const { upsert = false, batchSize = 100, upsertField = 'id', mediaFieldMappings = '[]' } = ctx.request.body || {};
      
      const csvImportService = strapi.plugin('csv-import').service('csvImport');
      
      // Check if file is present in request
      if (!ctx.request.files || !ctx.request.files.file) {
        ctx.throw(400, 'No file uploaded');
        return;
      }

      const file = ctx.request.files.file;
      const fs = require('fs');
      const fileBuffer = fs.readFileSync(file.path);
      
      // Get content type info
      const contentTypes = csvImportService.getContentTypes();
      const targetContentType = contentTypes[contentType];
      
      if (!targetContentType) {
        ctx.throw(404, `Content type "${contentType}" not found`);
        return;
      }

      // Parse CSV
      const csvData = await csvImportService.parseCsv(fileBuffer);
      
      // Validate data
      const validation = await csvImportService.validateCsvData(csvData, targetContentType);
      
      if (validation.errors.length > 0) {
        ctx.status = 400;
        ctx.body = {
          error: 'Validation failed',
          details: {
            errors: validation.errors,
            warnings: validation.warnings,
            invalidRows: validation.invalidRows,
          },
        };
        return;
      }

      // Process relations if any
      const relationsProcessedData = await csvImportService.processRelations(
        validation.validData,
        targetContentType
      );

      // Process components if any
      const processedData = await csvImportService.processComponents(
        relationsProcessedData,
        targetContentType
      );

      // Parse media field mappings
      let parsedMediaMappings = [];
      try {
        parsedMediaMappings = JSON.parse(mediaFieldMappings);
      } catch (e) {
        console.warn('Failed to parse media field mappings:', e);
      }

      // Convert string to boolean for upsert
      const upsertBoolean = upsert === 'true' || upsert === true;

      // Import data with media mappings
      const importResults = await csvImportService.importData(
        targetContentType.uid,
        processedData,
        { upsert: upsertBoolean, batchSize, upsertField, mediaFieldMappings: parsedMediaMappings }
      );

      ctx.body = {
        data: {
          ...importResults,
          totalProcessed: processedData.length,
          warnings: validation.warnings,
          contentType: targetContentType.displayName,
        },
      };
    } catch (error) {
      ctx.throw(500, `Failed to import CSV: ${error.message}`);
    }
  },

  /**
   * Export content type data with relation field of first column
   */
  async exportCsv(ctx) {
    try {
      const { contentType } = ctx.params;
      const { filters = {} } = ctx.request.body || {};
      
      const csvImportService = strapi.plugin('csv-import').service('csvImport');
      
      // Get content type info
      const contentTypes = csvImportService.getContentTypes();
      const targetContentType = contentTypes[contentType];
      
      if (!targetContentType) {
        ctx.throw(404, `Content type "${contentType}" not found`);
        return;
      }

      // Get the schema to understand relation fields
      const schema = targetContentType.attributes;
      const relationFields = {};
      const populateConfig = {};

      // Build populate config for relation and component fields
      Object.keys(schema).forEach(fieldName => {
        const field = schema[fieldName];
        if (field.type === 'relation') {
          relationFields[fieldName] = {
            type: field.relation,
            target: field.target
          };

          // Build populate configuration based on relation type
          populateConfig[fieldName] = { fields: ['*'] };
        } else if (field.type === 'component') {
          // Populate component fields
          populateConfig[fieldName] = true;
        }
      });

      // Fetch data with relations populated
      const entries = await strapi.entityService.findMany(targetContentType.uid, {
        filters,
        populate: populateConfig,
        pagination: { limit: 1000 }
      });

      // Transform data to include relation field data with their first columns
      const transformedEntries = entries.map(entry => {
        const transformedEntry = { ...entry };
        
        // Process all relation and component fields
        Object.keys(schema).forEach(fieldName => {
          const field = schema[fieldName];
          
          if (field.type === 'component' && entry[fieldName]) {
            const componentData = entry[fieldName];
            
            if (Array.isArray(componentData)) {
              // For repeatable components, create flattened columns
              componentData.forEach((component, index) => {
                if (component && typeof component === 'object') {
                  Object.keys(component).forEach(key => {
                    if (key !== 'id' && key !== '__component' && typeof component[key] !== 'object') {
                      transformedEntry[`${fieldName}.${index + 1}.${key}`] = component[key];
                    }
                  });
                }
              });
              // Remove original component field
              delete transformedEntry[fieldName];
            } else if (componentData && typeof componentData === 'object') {
              // For single components, flatten the fields
              Object.keys(componentData).forEach(key => {
                if (key !== 'id' && key !== '__component' && typeof componentData[key] !== 'object') {
                  transformedEntry[`${fieldName}.${key}`] = componentData[key];
                }
              });
              // Remove original component field
              delete transformedEntry[fieldName];
            }
          } else if (field.type === 'relation' && entry[fieldName]) {
            const relationData = entry[fieldName];
            
            if (Array.isArray(relationData)) {
              // For many relations, get the first column of each related item
              const relationValues = [];
              relationData.forEach(item => {
                if (item && typeof item === 'object') {
                  // Get target content type to find its first column
                  const targetContentType = strapi.contentTypes[field.target];
                  if (targetContentType) {
                    const targetFirstField = Object.keys(targetContentType.attributes)[0];
                    const firstColumnValue = item[targetFirstField] || item.name || item.title || item.displayName || item.id;
                    relationValues.push(firstColumnValue);
                  }
                }
              });
              
              // Add flattened relation data with dot notation (only first field)
              const targetContentType = strapi.contentTypes[field.target];
              if (targetContentType) {
                const targetFirstField = Object.keys(targetContentType.attributes)[0];
                transformedEntry[`${fieldName}.${targetFirstField}`] = relationValues.join(', ');
              }
              
            } else if (relationData && typeof relationData === 'object') {
              // For single relations, get the first column of the related item
              const targetContentType = strapi.contentTypes[field.target];
              if (targetContentType) {
                const targetFirstField = Object.keys(targetContentType.attributes)[0];
                const firstColumnValue = relationData[targetFirstField] || relationData.name || relationData.title || relationData.displayName || relationData.id;
                
                transformedEntry[`${fieldName}.${targetFirstField}`] = firstColumnValue;
              }
            }
            
            // Remove the original relation field since we now have dot notation
            delete transformedEntry[fieldName];
          }
        });

        // Clean up internal Strapi fields for CSV export
        delete transformedEntry.createdAt;
        delete transformedEntry.updatedAt;
        delete transformedEntry.publishedAt;

        return transformedEntry;
      });

      // Convert to CSV format
      const createCsvContent = (data) => {
        if (!data || data.length === 0) return 'No data available';
        
        const headers = Object.keys(data[0]).filter(key => 
          !key.startsWith('__') && typeof data[0][key] !== 'object'
        );
        const csvRows = [headers.join(',')];
        
        data.forEach(row => {
          const values = headers.map(header => {
            const value = row[header];
            // Handle null/undefined values and escape commas/quotes
            if (value === null || value === undefined) return '';
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          });
          csvRows.push(values.join(','));
        });
        
        return csvRows.join('\n');
      };

      const csvContent = createCsvContent(transformedEntries);
      const filename = `${targetContentType.displayName.replace(/\s+/g, '_')}_export_${new Date().toISOString().split('T')[0]}.csv`;
      
      ctx.set({
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
      
      ctx.body = csvContent;

    } catch (error) {
      ctx.throw(500, `Failed to export CSV: ${error.message}`);
    }
  },
});
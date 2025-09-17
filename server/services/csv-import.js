'use strict';

const csv = require('csv-parser');
const { Readable } = require('stream');

module.exports = ({ strapi }) => ({
  /**
   * Get all available content types
   */
  getContentTypes() {
    const contentTypes = strapi.contentTypes;
    const apiContentTypes = {};

    Object.keys(contentTypes).forEach(key => {
      if (key.startsWith('api::')) {
        const contentType = contentTypes[key];
        const { singularName, pluralName, displayName } = contentType.info;
        
        apiContentTypes[singularName] = {
          uid: key,
          singularName,
          pluralName,
          displayName: displayName || singularName,
          attributes: contentType.attributes,
        };
      }
    });

    return apiContentTypes;
  },

  /**
   * Parse CSV buffer and return data
   */
  async parseCsv(buffer) {
    return new Promise((resolve, reject) => {
      const results = [];
      const stream = Readable.from(buffer);

      stream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  },

  /**
   * Validate CSV data against content type schema
   */
  async validateCsvData(data, contentType) {
    const errors = [];
    const warnings = [];
    const { attributes } = contentType;

    if (!Array.isArray(data) || data.length === 0) {
      errors.push('CSV file is empty or invalid');
      return { errors, warnings, validData: [] };
    }

    const csvHeaders = Object.keys(data[0]);
    const requiredFields = Object.keys(attributes).filter(attr => {
      const attribute = attributes[attr];
      return attribute.required && !attribute.default;
    });

    // Parse dot notation headers and create mapping
    const headerMapping = this.parseHeaderMapping(csvHeaders, attributes);
    
    // Check for missing required fields (considering dot notation)
    const mappedFieldNames = Object.values(headerMapping).map(mapping => mapping.field);
    const missingRequired = requiredFields.filter(field => !mappedFieldNames.includes(field));
    if (missingRequired.length > 0) {
      errors.push(`Missing required fields: ${missingRequired.join(', ')}`);
    }

    // Check for unknown fields (ignore dot notation fields)
    const unknownFields = csvHeaders.filter(header => {
      const mapping = headerMapping[header];
      return !mapping || (!mapping.isValid && !mapping.isDotNotation);
    });
    if (unknownFields.length > 0) {
      warnings.push(`Unknown fields (will be ignored): ${unknownFields.join(', ')}`);
    }

    // Validate relation field uniqueness
    const relationUniqueValidation = await this.validateRelationFieldUniqueness(data, headerMapping, attributes);
    if (relationUniqueValidation.errors.length > 0) {
      errors.push(...relationUniqueValidation.errors);
    }
    if (relationUniqueValidation.warnings.length > 0) {
      warnings.push(...relationUniqueValidation.warnings);
    }

    const validData = data.map((row, index) => {
      const validatedRow = {};
      const rowErrors = [];

      // Process each CSV header and map it to the appropriate field
      Object.keys(row).forEach(csvHeader => {
        const mapping = headerMapping[csvHeader];
        if (!mapping || !mapping.isValid) return;

        const fieldName = mapping.field;
        const attribute = attributes[fieldName];
        const value = row[csvHeader];

        // Store dot notation info for relation/component processing
        if (mapping.isDotNotation) {
          if (mapping.isComponent) {
            // Store component data
            if (!validatedRow[`__${fieldName}_componentData`]) {
              validatedRow[`__${fieldName}_componentData`] = {};
            }
            validatedRow[`__${fieldName}_componentData`][mapping.componentField] = value;
          } else {
            // Store relation data
            validatedRow[`__${fieldName}_dotNotation`] = {
              relationField: mapping.relationField,
              value: value
            };
          }
        }

        if (value !== undefined && value !== '') {
          // Type validation
          switch (attribute.type) {
            case 'integer':
            case 'biginteger':
              const intVal = parseInt(value, 10);
              if (isNaN(intVal)) {
                rowErrors.push(`Row ${index + 1}: "${fieldName}" must be a number`);
              } else {
                validatedRow[fieldName] = intVal;
              }
              break;

            case 'decimal':
            case 'float':
              const floatVal = parseFloat(value);
              if (isNaN(floatVal)) {
                rowErrors.push(`Row ${index + 1}: "${fieldName}" must be a decimal number`);
              } else {
                validatedRow[fieldName] = floatVal;
              }
              break;

            case 'boolean':
              const boolVal = value.toLowerCase();
              if (['true', 'false', '1', '0', 'yes', 'no'].includes(boolVal)) {
                validatedRow[fieldName] = ['true', '1', 'yes'].includes(boolVal);
              } else {
                rowErrors.push(`Row ${index + 1}: "${fieldName}" must be true/false, 1/0, or yes/no`);
              }
              break;

            case 'date':
            case 'datetime':
            case 'time':
              const dateVal = new Date(value);
              if (isNaN(dateVal.getTime())) {
                rowErrors.push(`Row ${index + 1}: "${fieldName}" must be a valid date`);
              } else {
                validatedRow[fieldName] = dateVal.toISOString();
              }
              break;

            case 'email':
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailRegex.test(value)) {
                rowErrors.push(`Row ${index + 1}: "${fieldName}" must be a valid email`);
              } else {
                validatedRow[fieldName] = value;
              }
              break;

            case 'enumeration':
              if (attribute.enum && !attribute.enum.includes(value)) {
                rowErrors.push(`Row ${index + 1}: "${fieldName}" must be one of: ${attribute.enum.join(', ')}`);
              } else {
                validatedRow[fieldName] = value;
              }
              break;

            case 'relation':
              // Store relation values for processing later
              validatedRow[fieldName] = value;
              break;

            case 'component':
              // Component values are handled via dot notation, skip direct assignment
              break;

            default:
              // String and other types
              validatedRow[fieldName] = String(value);
          }
        } else if (attribute.required && !attribute.default && !mapping.isDotNotation) {
          rowErrors.push(`Row ${index + 1}: Required field "${fieldName}" is missing`);
        }
      });

      return {
        data: validatedRow,
        errors: rowErrors,
        originalRow: row,
      };
    });

    const allRowErrors = validData.flatMap(row => row.errors);
    
    return {
      errors: [...errors, ...allRowErrors],
      warnings,
      validData: validData.filter(row => row.errors.length === 0).map(row => row.data),
      invalidRows: validData.filter(row => row.errors.length > 0),
    };
  },

  /**
   * Parse CSV headers and create mapping for dot notation and regular fields
   */
  parseHeaderMapping(csvHeaders, attributes) {
    const headerMapping = {};

    csvHeaders.forEach(header => {
      if (header.includes('.')) {
        // Handle dot notation: relation.field or component.field or component.relation.field
        const parts = header.split('.');
        const [fieldName] = parts;
        
        if (attributes[fieldName]) {
          const attribute = attributes[fieldName];
          
          if (attribute.type === 'relation') {
            // Handle relation.field
            const relationField = parts[1];
            headerMapping[header] = {
              field: fieldName,
              relationField: relationField,
              isDotNotation: true,
              isValid: true
            };
          } else if (attribute.type === 'component') {
            // Handle component.field or component.relation.field
            headerMapping[header] = {
              field: fieldName,
              componentField: parts.slice(1).join('.'), // Everything after component name
              isDotNotation: true,
              isComponent: true,
              isValid: true,
              componentName: attribute.component
            };
          } else {
            headerMapping[header] = {
              field: header,
              isDotNotation: true,
              isValid: false
            };
          }
        } else {
          headerMapping[header] = {
            field: header,
            isDotNotation: true,
            isValid: false
          };
        }
      } else {
        // Regular field
        if (attributes[header]) {
          headerMapping[header] = {
            field: header,
            isDotNotation: false,
            isValid: true
          };
        } else {
          headerMapping[header] = {
            field: header,
            isDotNotation: false,
            isValid: false
          };
        }
      }
    });

    return headerMapping;
  },

  /**
   * Validate that relation field target fields are set as unique in schema
   */
  async validateRelationFieldUniqueness(data, headerMapping, attributes) {
    const errors = [];
    const warnings = [];

    // Get all relation fields from the header mapping
    const relationFields = {};
    Object.keys(headerMapping).forEach(csvHeader => {
      const mapping = headerMapping[csvHeader];
      if (mapping && mapping.isValid && !mapping.isComponent && mapping.isDotNotation) {
        const fieldName = mapping.field;
        const attribute = attributes[fieldName];
        
        if (attribute && attribute.type === 'relation') {
          relationFields[fieldName] = {
            csvHeader: csvHeader,
            relationField: mapping.relationField,
            attribute: attribute
          };
        }
      }
    });

    // Validate each relation field's target field uniqueness
    for (const fieldName of Object.keys(relationFields)) {
      const relationInfo = relationFields[fieldName];
      const targetContentType = relationInfo.attribute.target;
      const searchField = relationInfo.relationField;
      
      if (!targetContentType || !searchField) {
        continue;
      }

      try {
        // Get target content type schema
        const targetSchema = strapi.contentTypes[targetContentType];
        if (!targetSchema) {
          warnings.push(`Target content type "${targetContentType}" not found for relation field "${fieldName}"`);
          continue;
        }

        // Check if the target field exists
        const targetAttribute = targetSchema.attributes[searchField];
        if (!targetAttribute) {
          errors.push(
            `Target field "${searchField}" not found in content type "${targetContentType}" for relation field "${fieldName}.${searchField}"`
          );
          continue;
        }

        // Check if the target field is marked as unique
        const isUnique = targetAttribute.unique === true;
        
        if (!isUnique) {
          errors.push(
            `Field "${searchField}" in content type "${targetContentType}" must be set as unique for relation field "${fieldName}.${searchField}"`
          );
        }
        
      } catch (error) {
        console.error(`Error validating relation field schema ${fieldName}:`, error);
        warnings.push(`Could not validate relation field schema "${fieldName}": ${error.message}`);
      }
    }

    return { errors, warnings };
  },

  /**
   * Import validated data into Strapi
   */
  async importData(contentTypeUid, validData, options = {}) {
    const { upsert = false, batchSize = 100, upsertField = 'id', mediaFieldMappings = [] } = options;
    const results = {
      created: 0,
      updated: 0,
      errors: [],
    };

    // Process data in batches
    for (let i = 0; i < validData.length; i += batchSize) {
      const batch = validData.slice(i, i + batchSize);
      
      for (const item of batch) {
        try {
          // Process media fields if any mappings exist
          if (mediaFieldMappings.length > 0) {
            await this.processMediaFields(item, mediaFieldMappings, upsertField);
          }

          if (upsert && item[upsertField]) {
            // Try to find existing record by the specified field
            const existing = await this.findExistingRecord(contentTypeUid, upsertField, item[upsertField]);
            
            if (existing) {
              // Update existing record
              await strapi.entityService.update(contentTypeUid, existing.id, { data: item });
              results.updated++;
            } else {
              // Create new record if not found
              await strapi.entityService.create(contentTypeUid, { data: item });
              results.created++;
            }
          } else {
            // Create new record
            await strapi.entityService.create(contentTypeUid, { data: item });
            results.created++;
          }
        } catch (error) {
          results.errors.push({
            row: item,
            error: error.message,
          });
        }
      }
    }

    return results;
  },

  /**
   * Find existing record by specified field
   */
  async findExistingRecord(contentTypeUid, fieldName, fieldValue) {
    try {
      const entities = await strapi.entityService.findMany(contentTypeUid, {
        filters: {
          [fieldName]: fieldValue
        },
        limit: 1,
      });
      
      return entities && entities.length > 0 ? entities[0] : null;
    } catch (error) {
      console.error(`Error finding existing record by ${fieldName}:`, error);
      return null;
    }
  },

  /**
   * Handle relation fields in CSV data
   */
  async processRelations(data, contentType) {
    const { attributes } = contentType;
    const processedData = [];

    for (const row of data) {
      const processedRow = { ...row };

      for (const fieldName of Object.keys(attributes)) {
        const attribute = attributes[fieldName];
        
        if (attribute.type === 'relation') {
          // Check if we have dot notation data for this relation
          const dotNotationKey = `__${fieldName}_dotNotation`;
          const dotNotationData = row[dotNotationKey];
          
          let relationValue, searchField = null;
          
          if (dotNotationData) {
            // Use dot notation data (relation.field format)
            relationValue = dotNotationData.value;
            searchField = dotNotationData.relationField;
          } else if (row[fieldName]) {
            // Use direct relation value
            relationValue = row[fieldName];
          } else {
            continue;
          }
          
          try {
            switch (attribute.relation) {
              case 'oneToOne':
              case 'manyToOne':
                // Find related entity by specific field or auto-detect
                const relatedEntity = await this.findRelatedEntity(attribute.target, relationValue, searchField);
                
                if (relatedEntity) {
                  processedRow[fieldName] = relatedEntity.id;
                } else {
                  delete processedRow[fieldName];
                }
                break;
                
              case 'oneToMany':
              case 'manyToMany':
                // Handle multiple relations (comma-separated values)
                const values = relationValue.split(',').map(val => val.trim());
                const relatedEntities = [];
                
                for (const value of values) {
                  const entity = await this.findRelatedEntity(attribute.target, value, searchField);
                  if (entity) {
                    relatedEntities.push(entity);
                  }
                }
                
                if (relatedEntities.length > 0) {
                  processedRow[fieldName] = relatedEntities.map(entity => entity.id);
                } else {
                  delete processedRow[fieldName];
                }
                break;
            }
          } catch (error) {
            // If relation processing fails, remove the field
            delete processedRow[fieldName];
          }
        }
      }

      // Clean up temporary dot notation keys
      Object.keys(processedRow).forEach(key => {
        if (key.startsWith('__') && key.endsWith('_dotNotation')) {
          delete processedRow[key];
        }
      });

      processedData.push(processedRow);
    }

    return processedData;
  },

  /**
   * Find related entity by ID, name, title, slug, or other common fields
   * @param {string} targetContentType - The target content type UID
   * @param {string} value - The value to search for
   * @param {string} searchField - Specific field to search in (from dot notation)
   */
  async findRelatedEntity(targetContentType, value, searchField = null) {
    try {
      // If specific search field is provided (from dot notation), use it first
      if (searchField) {
        const schema = strapi.contentTypes[targetContentType];
        if (schema && schema.attributes[searchField]) {
          const entities = await strapi.entityService.findMany(targetContentType, {
            filters: { 
              [searchField]: {
                $eqi: value // case-insensitive exact match
              }
            },
            limit: 1,
          });
          
          if (entities && entities.length > 0) {
            return entities[0];
          }
          
          // Try partial match if exact match fails
          const partialEntities = await strapi.entityService.findMany(targetContentType, {
            filters: { 
              [searchField]: {
                $containsi: value // case-insensitive contains
              }
            },
            limit: 1,
          });
          
          if (partialEntities && partialEntities.length > 0) {
            return partialEntities[0];
          }
        }
      }

      // First try to find by ID if the value is numeric
      if (!isNaN(Number(value)) && !isNaN(parseInt(String(value)))) {
        const entityById = await strapi.entityService.findMany(targetContentType, {
          filters: { id: Number(value) },
          limit: 1,
        });
        if (entityById && entityById.length > 0) {
          return entityById[0];
        }
      }

      // Get the content type schema to check available fields
      const schema = strapi.contentTypes[targetContentType];
      if (!schema) return null;

      const attributes = schema.attributes;
      const searchFields = [];

      // Common fields to search in
      const commonFields = ['name', 'title', 'slug', 'displayName', 'label', 'country'];
      
      for (const field of commonFields) {
        if (attributes[field] && attributes[field].type === 'string') {
          searchFields.push(field);
        }
      }

      // Try to find by common string fields
      for (const field of searchFields) {
        const entities = await strapi.entityService.findMany(targetContentType, {
          filters: { 
            [field]: {
              $eqi: value // case-insensitive exact match
            }
          },
          limit: 1,
        });
        
        if (entities && entities.length > 0) {
          return entities[0];
        }
      }

      // If no exact match, try partial match on the first available string field
      if (searchFields.length > 0) {
        const entities = await strapi.entityService.findMany(targetContentType, {
          filters: { 
            [searchFields[0]]: {
              $containsi: value // case-insensitive contains
            }
          },
          limit: 1,
        });
        
        if (entities && entities.length > 0) {
          return entities[0];
        }
      }

      return null;
    } catch (error) {
      console.error(`Error finding related entity for ${targetContentType}:`, error);
      return null;
    }
  },

  /**
   * Process component fields in CSV data
   */
  async processComponents(data, contentType) {
    const { attributes } = contentType;
    const processedData = [];

    for (const row of data) {
      const processedRow = { ...row };

      for (const fieldName of Object.keys(attributes)) {
        const attribute = attributes[fieldName];
        
        if (attribute.type === 'component') {
          const componentDataKey = `__${fieldName}_componentData`;
          const componentData = row[componentDataKey];
          
          if (componentData && Object.keys(componentData).length > 0) {
            try {
              // Get component schema
              const componentSchema = strapi.components[attribute.component];
              if (!componentSchema) {
                console.error(`Component schema not found: ${attribute.component}`);
                continue;
              }

              // Create component entries array
              const componentEntries = [];
              
              if (attribute.repeatable) {
                // For repeatable components, parse comma-separated values
                const componentRows = this.parseComponentRows(componentData);
                
                for (const componentRowData of componentRows) {
                  const processedComponentData = await this.processComponentData(
                    componentRowData, 
                    componentSchema.attributes
                  );
                  if (processedComponentData) {
                    componentEntries.push(processedComponentData);
                  }
                }
              } else {
                // For single components
                const processedComponentData = await this.processComponentData(
                  componentData, 
                  componentSchema.attributes
                );
                if (processedComponentData) {
                  componentEntries.push(processedComponentData);
                }
              }
              
              if (componentEntries.length > 0) {
                processedRow[fieldName] = attribute.repeatable ? componentEntries : componentEntries[0];
              }
              
              // Clean up temporary data
              delete processedRow[componentDataKey];
              
            } catch (error) {
              console.error(`Error processing component ${fieldName}:`, error);
              delete processedRow[componentDataKey];
            }
          }
        }
      }

      processedData.push(processedRow);
    }

    return processedData;
  },

  /**
   * Parse component rows from CSV data (handles comma-separated values for repeatable components)
   */
  parseComponentRows(componentData) {
    const componentRows = [];
    const fieldKeys = Object.keys(componentData);
    
    if (fieldKeys.length === 0) {
      return componentRows;
    }
    
    // Find the maximum number of comma-separated values across all fields
    let maxRows = 1;
    const parsedFields = {};
    
    for (const fieldKey of fieldKeys) {
      const values = String(componentData[fieldKey]).split(',').map(v => v.trim());
      parsedFields[fieldKey] = values;
      maxRows = Math.max(maxRows, values.length);
    }
    
    // Create component rows
    for (let i = 0; i < maxRows; i++) {
      const rowData = {};
      let hasData = false;
      
      for (const fieldKey of fieldKeys) {
        const values = parsedFields[fieldKey];
        const value = i < values.length ? values[i] : '';
        if (value) {
          rowData[fieldKey] = value;
          hasData = true;
        }
      }
      
      if (hasData) {
        componentRows.push(rowData);
      }
    }
    
    return componentRows;
  },

  /**
   * Process individual component data (handle relations within components)
   */
  async processComponentData(componentData, componentAttributes) {
    const processedData = {};
    
    for (const [fieldName, value] of Object.entries(componentData)) {
      if (!value) continue;
      
      // Handle dot notation within components (e.g., "do_number.name")
      const parts = fieldName.split('.');
      const actualFieldName = parts[0];
      const searchField = parts.length > 1 ? parts[1] : null;
      
      const attribute = componentAttributes[actualFieldName];
      if (!attribute) continue;
      
      if (attribute.type === 'relation') {
        // Handle relation within component
        const relatedEntity = await this.findRelatedEntity(attribute.target, value, searchField);
        if (relatedEntity) {
          processedData[actualFieldName] = relatedEntity.id;
        }
      } else {
        // Handle regular component fields
        processedData[actualFieldName] = this.convertComponentFieldValue(value, attribute);
      }
    }
    
    return Object.keys(processedData).length > 0 ? processedData : null;
  },

  /**
   * Convert component field values based on attribute type
   */
  convertComponentFieldValue(value, attribute) {
    if (value === undefined || value === '') {
      return null;
    }
    
    switch (attribute.type) {
      case 'integer':
      case 'biginteger':
        const intVal = parseInt(value, 10);
        return isNaN(intVal) ? null : intVal;
        
      case 'decimal':
      case 'float':
        const floatVal = parseFloat(value);
        return isNaN(floatVal) ? null : floatVal;
        
      case 'boolean':
        const boolVal = String(value).toLowerCase();
        return ['true', '1', 'yes'].includes(boolVal);
        
      case 'date':
      case 'datetime':
      case 'time':
        const dateVal = new Date(value);
        return isNaN(dateVal.getTime()) ? null : dateVal.toISOString();
        
      default:
        return String(value);
    }
  },

  /**
   * Extract zip file and upload all files to media library
   */
  async extractAndUploadZip(zipFile, mediaField) {
    const fs = require('fs');
    const path = require('path');
    const AdmZip = require('adm-zip');
    
    try {
      console.log(`Starting zip extraction for ${zipFile.name}, field: ${mediaField}`);
      
      // Read zip file
      const zipBuffer = fs.readFileSync(zipFile.path);
      const zip = new AdmZip(zipBuffer);
      const zipEntries = zip.getEntries();
      
      console.log(`Found ${zipEntries.length} entries in zip file`);
      
      const uploadedFiles = [];
      
      for (const entry of zipEntries) {
        if (!entry.isDirectory) {
          try {
            console.log(`Processing file: ${entry.entryName}`);
            
            // Extract file content
            const fileContent = entry.getData();
            const fileName = entry.entryName;
            
            console.log(`File size: ${fileContent.length} bytes`);
            
            // Create temporary file for upload
            const tempPath = path.join('/tmp', `zip_extract_${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
            fs.writeFileSync(tempPath, fileContent);
            
            // Create file object for upload
            const fileToUpload = {
              path: tempPath,
              name: fileName,
              type: this.getMimeType(fileName),
              size: fileContent.length,
            };

            // Use a simpler, more direct approach for file upload
            let uploadedFile;
            
            try {
              console.log(`Attempting to upload ${fileName} with size ${fileContent.length} bytes`);
              
              // Get the upload service
              const uploadService = strapi.service('plugin::upload.upload');
              
              if (!uploadService) {
                throw new Error('Upload service not available');
              }
              
              // Create a proper file stream-like object that Strapi expects
              const fileData = {
                path: tempPath,
                name: fileName,
                type: this.getMimeType(fileName),
                size: fileContent.length,
                stream: fs.createReadStream(tempPath),
              };
              
              console.log('File data prepared:', { 
                name: fileData.name, 
                type: fileData.type, 
                size: fileData.size 
              });
              
              // Upload using the service directly
              uploadedFile = await uploadService.upload({
                data: {
                  fileInfo: {
                    name: fileName,
                    alternativeText: fileName,
                    caption: `Extracted from zip for ${mediaField} field`,
                  }
                },
                files: fileData
              });
              
              console.log(`Upload service returned:`, uploadedFile ? uploadedFile.length : 'null');
              
            } catch (uploadError) {
              console.error('Upload failed:', uploadError.message);
              console.error('Full error:', uploadError);
              throw uploadError;
            }
            
            if (uploadedFile && uploadedFile.length > 0) {
              const file = uploadedFile[0];
              uploadedFiles.push({
                id: file.id,
                name: fileName,
                url: file.url,
                originalName: fileName,
                size: fileContent.length,
              });
              console.log(`Successfully uploaded: ${fileName} with ID: ${file.id}`);
            } else {
              console.error(`Upload failed for ${fileName}: No file returned`);
            }
            
            // Clean up temp file
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          } catch (fileError) {
            console.error(`Error processing file ${entry.entryName}:`, fileError);
          }
        }
      }
      
      console.log(`Upload complete. Total files uploaded: ${uploadedFiles.length}`);
      return uploadedFiles;
    } catch (error) {
      console.error('Error extracting zip file:', error);
      throw new Error(`Failed to extract zip file: ${error.message}`);
    }
  },

  /**
   * Extract and process media ZIP file with folder-based organization
   */
  async extractAndProcessMediaZip(zipFile, targetContentType, matchField) {
    const fs = require('fs');
    const path = require('path');
    const AdmZip = require('adm-zip');
    
    try {
      console.log(`Starting media ZIP extraction for content type: ${targetContentType.displayName}, match field: ${matchField}`);
      
      // Read zip file
      const zipBuffer = fs.readFileSync(zipFile.path);
      const zip = new AdmZip(zipBuffer);
      const zipEntries = zip.getEntries();
      
      console.log(`Found ${zipEntries.length} entries in ZIP file`);
      
      // Get media fields from content type
      const mediaFields = {};
      Object.keys(targetContentType.attributes).forEach(fieldName => {
        const attribute = targetContentType.attributes[fieldName];
        if (attribute.type === 'media') {
          mediaFields[fieldName] = [];
        }
      });
      
      console.log(`Available media fields:`, Object.keys(mediaFields));
      
      // Organize files - support both structured folders and general data folder
      const folderFiles = {};
      const allFiles = [];
      
      for (const entry of zipEntries) {
        if (!entry.isDirectory) {
          const entryPath = entry.entryName;
          const pathParts = entryPath.split('/');
          
          // Skip macOS system files
          if (entryPath.includes('__MACOSX') || pathParts.some(part => part.startsWith('._'))) {
            continue;
          }
          
          if (pathParts.length >= 2) {
            const fileName = pathParts[pathParts.length - 1];
            
            // Check if any folder in the path corresponds to a media field
            let matchedMediaField = null;
            for (let i = 0; i < pathParts.length - 1; i++) {
              const folderName = pathParts[i];
              if (mediaFields[folderName] !== undefined) {
                matchedMediaField = folderName;
                break;
              }
            }
            
            if (matchedMediaField) {
              // Structured approach: folder name matches media field
              if (!folderFiles[matchedMediaField]) {
                folderFiles[matchedMediaField] = [];
              }
              
              folderFiles[matchedMediaField].push({
                fileName: fileName,
                filePath: entryPath,
                entry: entry,
              });
              
              console.log(`Found file for media field "${matchedMediaField}": ${fileName}`);
            } else {
              // General folder approach: collect all files for distribution
              allFiles.push({
                fileName: fileName,
                filePath: entryPath,
                entry: entry,
                folderName: pathParts[0],
              });
              
              console.log(`Found file in general folder "${pathParts[0]}": ${fileName}`);
            }
          }
        }
      }
      
      // If no structured folders found, distribute all files to all media fields
      if (Object.keys(folderFiles).length === 0 && allFiles.length > 0) {
        console.log(`No structured folders found. Distributing ${allFiles.length} files to all media fields.`);
        
        // For general data folder, intelligently distribute files to media fields based on filename patterns
        Object.keys(mediaFields).forEach(mediaFieldName => {
          folderFiles[mediaFieldName] = this.filterFilesForMediaField(allFiles, mediaFieldName);
          console.log(`Added ${folderFiles[mediaFieldName].length} files to media field "${mediaFieldName}" based on filename patterns`);
        });
      }
      
      // Upload files to media library and create mappings (optimized to upload each file only once)
      const mediaFieldMappings = [];
      const uploadedFilesCache = new Map(); // Cache to avoid duplicate uploads
      
      // First pass: Upload all unique files
      const allUniqueFiles = new Map();
      for (const [fieldName, files] of Object.entries(folderFiles)) {
        for (const fileInfo of files) {
          const fileKey = `${fileInfo.fileName}_${fileInfo.filePath}`;
          if (!allUniqueFiles.has(fileKey)) {
            allUniqueFiles.set(fileKey, fileInfo);
          }
        }
      }
      
      console.log(`Uploading ${allUniqueFiles.size} unique files to media library...`);
      
      for (const [fileKey, fileInfo] of allUniqueFiles) {
        try {
          console.log(`Uploading file: ${fileInfo.fileName}`);
          
          // Extract file content
          const fileContent = fileInfo.entry.getData();
          
          // Skip system files
          if (fileInfo.fileName.startsWith('.') || fileInfo.fileName === '.DS_Store') {
            console.log(`Skipping system file: ${fileInfo.fileName}`);
            continue;
          }
          
          // Create temporary file for upload
          const tempPath = path.join('/tmp', `media_zip_${Date.now()}_${fileInfo.fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
          fs.writeFileSync(tempPath, fileContent);
          
          // Upload to Strapi media library
          const uploadService = strapi.service('plugin::upload.upload');
          
          if (!uploadService) {
            throw new Error('Upload service not available');
          }
          
          const fileData = {
            path: tempPath,
            name: fileInfo.fileName,
            type: this.getMimeType(fileInfo.fileName),
            size: fileContent.length,
            stream: fs.createReadStream(tempPath),
          };
          
          const uploadedFile = await uploadService.upload({
            data: {
              fileInfo: {
                name: fileInfo.fileName,
                alternativeText: fileInfo.fileName,
                caption: `Media file from ZIP upload`,
              }
            },
            files: fileData
          });
          
          if (uploadedFile && uploadedFile.length > 0) {
            const file = uploadedFile[0];
            uploadedFilesCache.set(fileKey, {
              id: file.id,
              name: fileInfo.fileName,
              url: file.url,
              originalName: fileInfo.fileName,
              size: fileContent.length,
            });
            console.log(`Successfully uploaded: ${fileInfo.fileName} with ID: ${file.id}`);
          }
          
          // Clean up temp file
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
          
        } catch (fileError) {
          console.error(`Error processing file ${fileInfo.fileName}:`, fileError);
        }
      }
      
      // Second pass: Create field mappings using cached uploaded files
      for (const [fieldName, files] of Object.entries(folderFiles)) {
        const uploadedFiles = [];
        
        for (const fileInfo of files) {
          const fileKey = `${fileInfo.fileName}_${fileInfo.filePath}`;
          const uploadedFile = uploadedFilesCache.get(fileKey);
          
          if (uploadedFile) {
            uploadedFiles.push(uploadedFile);
          }
        }
        
        // Create field mapping
        if (uploadedFiles.length > 0) {
          mediaFieldMappings.push({
            field: fieldName,
            uploadedFiles: uploadedFiles,
            matchField: matchField,
          });
          
          console.log(`Created mapping for field "${fieldName}" with ${uploadedFiles.length} files`);
        }
      }
      
      console.log(`Media ZIP processing complete. Created ${mediaFieldMappings.length} field mappings`);
      return mediaFieldMappings;
      
    } catch (error) {
      console.error('Error extracting and processing media ZIP file:', error);
      throw new Error(`Failed to extract and process media ZIP file: ${error.message}`);
    }
  },

  /**
   * Filter files for specific media field based on filename patterns and keywords
   */
  filterFilesForMediaField(files, mediaFieldName) {
    const fieldKeywords = {
      'reports': ['report', 'rpt', 'analysis', 'summary', 'result'],
      'lab_docs': ['lab', 'test', 'analysis', 'sample'],
      'referee_result': ['referee', 'ref', 'audit', 'verification', 'check'],
      'payment_docs': ['payment', 'pay', 'invoice', 'bill', 'receipt', 'financial'],
      'challan_docs': ['challan', 'delivery', 'transport', 'dispatch', 'shipping']
    };

    const keywords = fieldKeywords[mediaFieldName] || [];
    
    const filteredFiles = files.filter(file => {
      const fileName = file.fileName.toLowerCase();
      
      // Check if filename contains any of the keywords for this media field
      const matchingKeyword = keywords.find(keyword => 
        fileName.includes(keyword.toLowerCase())
      );
      
      if (matchingKeyword) {
        console.log(`File "${file.fileName}" matched keyword "${matchingKeyword}" for field "${mediaFieldName}"`);
        return true;
      }
      
      return false;
    });

    console.log(`Field "${mediaFieldName}" keywords: [${keywords.join(', ')}], matched ${filteredFiles.length}/${files.length} files`);
    
    return filteredFiles;
  },

  /**
   * Get MIME type based on file extension
   */
  getMimeType(filename) {
    const path = require('path');
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.txt': 'text/plain',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  },

  /**
   * Process media fields by matching files to CSV records using enhanced pattern matching
   */
  async processMediaFields(csvItem, mediaFieldMappings, matchField) {
    try {
      for (const mapping of mediaFieldMappings) {
        const { field, uploadedFiles, matchField: mappingMatchField } = mapping;
        const matchValue = csvItem[matchField || mappingMatchField];
        
        if (matchValue && uploadedFiles && uploadedFiles.length > 0) {
          // Enhanced file matching logic
          const matchingFiles = uploadedFiles.filter(file => {
            const fileName = file.name || file.originalName;
            const fileNameLower = fileName.toLowerCase();
            const matchValueLower = String(matchValue).toLowerCase();
            
            // Pattern 1: Exact match (e.g., "test_ch.pdf" matches "test_ch")
            const exactMatch = fileNameLower === `${matchValueLower}.${this.getFileExtension(fileName)}`;
            
            // Pattern 2: Numbered pattern (e.g., "test_ch_01.pdf", "test_ch_02.pdf" matches "test_ch")
            const numberedPatternRegex = new RegExp(`^${this.escapeRegExp(matchValueLower)}_\\d+\\.`, 'i');
            const numberedMatch = numberedPatternRegex.test(fileNameLower);
            
            // Pattern 3: Simple starts-with match (e.g., "test_ch_report.pdf" matches "test_ch")
            const startsWithMatch = fileNameLower.startsWith(matchValueLower);
            
            return exactMatch || numberedMatch || startsWithMatch;
          });
          
          if (matchingFiles.length > 0) {
            // Sort files for consistent ordering (numbered files in sequence)
            const sortedFiles = matchingFiles.sort((a, b) => {
              const aName = (a.name || a.originalName).toLowerCase();
              const bName = (b.name || b.originalName).toLowerCase();
              return aName.localeCompare(bName);
            });
            
            // Set the media field with the matching file IDs
            csvItem[field] = sortedFiles.map(file => file.id);
            
            console.log(`Mapped ${matchingFiles.length} files to field "${field}" for record with ${matchField}="${matchValue}":`, 
              sortedFiles.map(f => f.name || f.originalName));
          }
        }
      }
    } catch (error) {
      console.error('Error processing media fields:', error);
    }
  },

  /**
   * Helper function to escape special regex characters
   */
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  /**
   * Helper function to get file extension
   */
  getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
  },
});
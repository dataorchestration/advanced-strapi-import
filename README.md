# CSV Import Plugin for Strapi

A custom Strapi plugin that provides dynamic CSV import functionality for any content type.

## Features

- **Dynamic Content Type Support**: Import data into any Strapi content type
- **Data Validation**: Validates CSV data against content type schema
- **Field Type Support**: Handles various field types (string, number, boolean, date, email, enumeration, etc.)
- **Relation Handling**: Basic support for relation fields (oneToOne, manyToOne, oneToMany, manyToMany)
- **Preview & Validation**: Preview and validate data before importing
- **Batch Processing**: Configurable batch size for large datasets
- **Upsert Support**: Option to update existing records
- **Error Reporting**: Detailed error and warning messages
- **Admin Interface**: User-friendly admin panel interface

## Installation

The plugin is already installed in this Strapi instance. It's configured in `config/plugins.js`:

```javascript
"csv-import": {
  enabled: true,
  resolve: "./src/plugins/csv-import",
}
```

## Usage

### Admin Panel

1. Navigate to the **CSV Import** section in the admin panel (accessible via the left sidebar)
2. Select the content type you want to import data into
3. Choose your CSV file
4. Click **Upload & Validate** to preview and validate your data
5. Review validation results, warnings, and data preview
6. Configure import options (upsert, batch size)
7. Click **Import Data** to complete the import

### API Endpoints

The plugin exposes the following REST API endpoints:

#### Get Content Types
```
GET /api/csv-import/content-types
```
Returns all available content types that can be used for import.

#### Preview CSV
```
POST /api/csv-import/preview/:contentType
Content-Type: multipart/form-data

Body: file (CSV file)
```
Returns a preview of the CSV data without validation.

#### Upload & Validate CSV
```
POST /api/csv-import/upload/:contentType
Content-Type: multipart/form-data

Body: file (CSV file)
```
Uploads and validates CSV data against the specified content type schema.

#### Import CSV Data
```
POST /api/csv-import/import/:contentType
Content-Type: multipart/form-data

Body: 
- file (CSV file)
- upsert (boolean, optional)
- batchSize (number, optional)
```
Imports validated CSV data into the specified content type.

## CSV File Format

### Basic Requirements
- File must have `.csv` extension
- First row must contain column headers
- Column headers should match content type field names
- Empty rows are automatically skipped

### Field Type Mapping

| Strapi Field Type | CSV Format | Example |
|------------------|------------|---------|
| String/Text | Plain text | "John Doe" |
| Integer | Number | 123 |
| Float/Decimal | Decimal number | 123.45 |
| Boolean | true/false, 1/0, yes/no | true |
| Date/DateTime | ISO date string | 2023-12-25 |
| Email | Valid email | john@example.com |
| Enumeration | Must match enum values | "active" |
| Relations | ID or comma-separated IDs | 1 or "1,2,3" |

### Sample CSV Files

#### Countries Example (`countries-sample.csv`)
```csv
country
India
United States
China
Germany
Japan
```

#### Coal Companies Example (`coal-companies-sample.csv`)
```csv
name,location,established_year,active
Coal India Limited,India,1975,true
Peabody Energy,United States,1883,true
China Shenhua Energy,China,2001,true
```

## Error Handling

The plugin provides comprehensive error handling and validation:

### Validation Errors
- Missing required fields
- Invalid data types
- Invalid email formats
- Invalid enumeration values
- Invalid date formats

### Import Errors
- Database constraints violations
- Relation reference errors
- Duplicate key violations (when upsert is disabled)

## Configuration Options

### Import Options
- **Upsert**: Enable to update existing records when ID matches
- **Batch Size**: Number of records to process in each batch (default: 100)

### File Limits
- Maximum file size: 10MB
- Supported format: CSV only

## Relation Handling

### Simple Relations (oneToOne, manyToOne)
Use the ID of the related record:
```csv
name,category_id
"Product 1",1
"Product 2",2
```

### Multiple Relations (oneToMany, manyToMany)
Use comma-separated IDs:
```csv
name,tag_ids
"Article 1","1,2,3"
"Article 2","2,4"
```

## Troubleshooting

### Common Issues

1. **"Content type not found" error**
   - Ensure the content type name in the URL matches exactly
   - Check that the content type exists and is properly configured

2. **Validation errors**
   - Review CSV headers to ensure they match field names
   - Check data types and required fields
   - Ensure enumeration values are valid

3. **Import failures**
   - Check database constraints
   - Verify relation IDs exist
   - Review error messages for specific issues

### Debugging

Enable Strapi debug mode to see detailed error messages:
```bash
DEBUG=strapi:* npm run develop
```

## Dependencies

- `csv-parser`: For parsing CSV files
- `multer`: For handling file uploads

## Development

### Plugin Structure
```
src/plugins/csv-import/
├── admin/src/           # Admin panel interface
│   ├── components/      # React components
│   ├── pages/          # Admin pages
│   └── translations/   # i18n files
├── server/             # Server-side logic
│   ├── controllers/    # API controllers
│   ├── routes/         # Route definitions
│   └── services/       # Business logic
└── package.json        # Plugin configuration
```

### Key Services
- `csvImport.getContentTypes()`: Retrieves available content types
- `csvImport.parseCsv()`: Parses CSV buffer data
- `csvImport.validateCsvData()`: Validates data against schema
- `csvImport.importData()`: Imports data to Strapi
- `csvImport.processRelations()`: Handles relation fields

## License

This plugin is part of the Coal India project and follows the same licensing terms.
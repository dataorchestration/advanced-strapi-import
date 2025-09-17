# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-09-11

### Added
- Initial release of CSV Import plugin
- Dynamic content type support for CSV imports
- Data validation against content type schemas
- Support for various field types (string, number, boolean, date, email, enumeration)
- Basic relation handling (oneToOne, manyToOne, oneToMany, manyToMany)
- Preview and validation before importing
- Batch processing with configurable batch size
- Upsert support for updating existing records
- Comprehensive error reporting and validation messages
- User-friendly admin panel interface
- REST API endpoints for programmatic access

### Features
- Import data into any Strapi content type
- Handles CSV files up to 10MB
- Processes large datasets in batches
- Validates data types and required fields
- Supports relation fields with ID references
- Provides detailed error and warning messages
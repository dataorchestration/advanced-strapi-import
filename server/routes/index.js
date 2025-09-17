'use strict';

module.exports = [
  {
    method: 'GET',
    path: '/content-types',
    handler: 'csvImport.getContentTypes',
    config: {
      policies: [],
      auth: false,
    },
  },
  {
    method: 'POST',
    path: '/upload/:contentType',
    handler: 'csvImport.uploadCsv',
    config: {
      policies: [],
      auth: false,
    },
  },
  {
    method: 'POST',
    path: '/preview/:contentType',
    handler: 'csvImport.previewCsv',
    config: {
      policies: [],
      auth: false,
    },
  },
  {
    method: 'POST',
    path: '/upload-zip',
    handler: 'csvImport.uploadZip',
    config: {
      policies: [],
      auth: false,
    },
  },
  {
    method: 'POST',
    path: '/upload-media-zip',
    handler: 'csvImport.uploadMediaZip',
    config: {
      policies: [],
      auth: false,
    },
  },
  {
    method: 'POST',
    path: '/import/:contentType',
    handler: 'csvImport.importCsv',
    config: {
      policies: [],
      auth: false,
    },
  },
  {
    method: 'POST',
    path: '/export/:contentType',
    handler: 'csvImport.exportCsv',
    config: {
      policies: [],
      auth: false,
    },
  },
];
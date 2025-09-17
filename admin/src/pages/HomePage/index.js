import React, { useState, useEffect } from 'react';
import {
  Layout,
  HeaderLayout,
  ContentLayout,
  Main,
  Box,
  Typography,
  Button,
  Select,
  Option,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Flex,
  Stack,
} from '@strapi/design-system';
import { Upload, Check } from '@strapi/icons';

const HomePage = () => {
  const [contentTypes, setContentTypes] = useState({});
  const [selectedContentType, setSelectedContentType] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file || !selectedContentType) {
      alert('Please select a content type and file');
      return;
    }
    
    setLoading(true);
    // This would normally make the API call
    console.log('Would upload:', file.name, 'to', selectedContentType);
    setTimeout(() => {
      setLoading(false);
      alert('Upload functionality will be implemented');
    }, 1000);
  };

  return (
    <Layout>
      <Main>
        <HeaderLayout
          title="CSV Import"
          subtitle="Import data from CSV files into your content types"
        />
        <ContentLayout>
          <Stack spacing={6}>
            <Card>
              <CardHeader>
                <CardTitle>Upload Configuration</CardTitle>
              </CardHeader>
              <CardBody>
                <Stack spacing={4}>
                  <Box>
                    <Typography variant="pi" fontWeight="bold">
                      Select Content Type
                    </Typography>
                    <Box paddingTop={2}>
                      <select 
                        value={selectedContentType}
                        onChange={(e) => setSelectedContentType(e.target.value)}
                        style={{ 
                          width: '100%', 
                          padding: '8px', 
                          border: '1px solid #dcdce4',
                          borderRadius: '4px'
                        }}
                      >
                        <option value="">Choose a content type</option>
                        <option value="country">Country</option>
                        <option value="coal-company">Coal Company</option>
                        <option value="project">Project</option>
                      </select>
                    </Box>
                  </Box>

                  <Box>
                    <Typography variant="pi" fontWeight="bold">
                      Select CSV File
                    </Typography>
                    <Box paddingTop={2}>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileChange}
                        style={{ 
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #dcdce4',
                          borderRadius: '4px'
                        }}
                      />
                    </Box>
                  </Box>

                  <Flex justifyContent="flex-end">
                    <Button
                      onClick={handleUpload}
                      disabled={!file || !selectedContentType || loading}
                      loading={loading}
                      startIcon={<Upload />}
                    >
                      {loading ? 'Uploading...' : 'Upload & Validate'}
                    </Button>
                  </Flex>

                  <Box paddingTop={4}>
                    <Typography variant="omega" textColor="neutral600">
                      🚀 <strong>CSV Import Plugin Active!</strong><br/>
                      📝 Select a content type and CSV file to import data.<br/>
                      🔗 API endpoints are available at: <code>/csv-import/</code><br/>
                      📋 Sample files are in <code>sample-data/</code> directory.
                    </Typography>
                  </Box>
                </Stack>
              </CardBody>
            </Card>
          </Stack>
        </ContentLayout>
      </Main>
    </Layout>
  );
};

export default HomePage;
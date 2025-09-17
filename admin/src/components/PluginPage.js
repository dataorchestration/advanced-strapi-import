import React, { useState, useEffect } from "react";

const PluginPage = () => {
  const [contentTypes, setContentTypes] = useState({});
  const [selectedContentType, setSelectedContentType] = useState("");
  const [file, setFile] = useState(null);
  const [mediaZipFile, setMediaZipFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [upsertMode, setUpsertMode] = useState(false);
  const [upsertField, setUpsertField] = useState("id");
  const [instructionsExpanded, setInstructionsExpanded] = useState(false);
  const [exportContentType, setExportContentType] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  // Fetch content types on component mount
  useEffect(() => {
    const fetchContentTypes = async () => {
      try {
        // Try to fetch real content types from API
        const strapiToken = JSON.parse(
          localStorage.getItem("strapi-admin-jwt") || "{}"
        );
        const response = await fetch("/csv-import/content-types", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${strapiToken}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          setContentTypes(data.data || {});
        } else {
          // Fallback to mock content types
          const mockContentTypes = {
            country: { displayName: "Country", singularName: "country" },
            "coal-company": {
              displayName: "Coal Company",
              singularName: "coal-company",
            },
            project: { displayName: "Project", singularName: "project" },
            customer: { displayName: "Customer", singularName: "customer" },
            location: { displayName: "Location", singularName: "location" },
          };
          setContentTypes(mockContentTypes);
        }
      } catch (err) {
        setError("Failed to fetch content types");
        // Fallback to mock content types
        const mockContentTypes = {
          country: { displayName: "Country", singularName: "country" },
          "coal-company": {
            displayName: "Coal Company",
            singularName: "coal-company",
          },
          project: { displayName: "Project", singularName: "project" },
          customer: { displayName: "Customer", singularName: "customer" },
          location: { displayName: "Location", singularName: "location" },
        };
        setContentTypes(mockContentTypes);
      }
    };

    fetchContentTypes();
  }, []);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      if (
        selectedFile.type === "text/csv" ||
        selectedFile.name.endsWith(".csv")
      ) {
        setFile(selectedFile);
        setError("");
      } else {
        setError("Please select a valid CSV file");
        setFile(null);
      }
    }
  };

  const handleMediaZipFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      if (
        selectedFile.type === "application/zip" ||
        selectedFile.name.endsWith(".zip")
      ) {
        setMediaZipFile(selectedFile);
        setError("");
      } else {
        setError("Please select a valid ZIP file");
        setMediaZipFile(null);
      }
    }
  };

  const getMediaFieldsForContentType = () => {
    if (!selectedContentType || !contentTypes[selectedContentType]) {
      return [];
    }
    const attributes = contentTypes[selectedContentType].attributes || {};
    return Object.entries(attributes)
      .filter(([key, attr]) => attr.type === "media")
      .map(([key, attr]) => ({ key, label: `${key} (${attr.type})` }));
  };

  const handleUpload = async () => {
    if (!file || !selectedContentType) {
      setError("Please select both a content type and CSV file");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // First create a local preview
      const text = await file.text();
      const lines = text.split("\n").filter((line) => line.trim());
      const headers = lines[0] ? lines[0].split(",") : [];
      const sampleRows = lines.slice(1, 4);

      // Check if media ZIP is configured
      const hasMediaZip = mediaZipFile !== null;

      // Try to validate with real API
      const formData = new FormData();
      formData.append("file", file);

      const strapiToken = JSON.parse(
        localStorage.getItem("strapi-admin-jwt") || "{}"
      );
      const response = await fetch(
        `/csv-import/upload/${selectedContentType}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${strapiToken}`,
          },
          body: formData,
        }
      );

      if (response.ok) {
        const apiResult = await response.json();
        const validation = apiResult.data.validation;
        const mediaInfo = hasMediaZip 
          ? ` Media ZIP file uploaded: ${mediaZipFile.name}.`
          : '';
        
        // Check if validation has errors
        if (validation && validation.errors && validation.errors.length > 0) {
          setError(
            `Validation failed:\n${validation.errors.join('\n')}\n\n` +
            (validation.warnings && validation.warnings.length > 0 
              ? `Warnings:\n${validation.warnings.join('\n')}` 
              : '')
          );
        } else {
          setResult({
            fileName: file.name,
            contentType: selectedContentType,
            headers: headers,
            totalRows: lines.length - 1,
            sampleRows: sampleRows,
            message:
              `CSV file validated successfully with API! Ready for import.${mediaInfo}` +
              (validation && validation.warnings && validation.warnings.length > 0 
                ? `\n\nWarnings:\n${validation.warnings.join('\n')}` 
                : ''),
            apiValidated: true,
            apiResult: apiResult.data,
            hasMediaZip: hasMediaZip,
            validation: validation,
          });
        }
      } else {
        // Try to get validation errors from API response
        try {
          const errorResult = await response.json();
          if (errorResult.details && errorResult.details.errors) {
            setError(
              `Validation failed:\n${errorResult.details.errors.join('\n')}\n\n` +
              (errorResult.details.warnings && errorResult.details.warnings.length > 0 
                ? `Warnings:\n${errorResult.details.warnings.join('\n')}` 
                : '')
            );
            return;
          }
        } catch (parseError) {
          // If we can't parse the error response, continue with fallback
        }
        
        // Fallback to local preview
        const mediaInfo = hasMediaZip 
          ? ` Media ZIP file uploaded: ${mediaZipFile.name}.`
          : '';
        
        setResult({
          fileName: file.name,
          contentType: selectedContentType,
          headers: headers,
          totalRows: lines.length - 1,
          sampleRows: sampleRows,
          message:
            `CSV file preview ready! (API validation failed - will use basic import)${mediaInfo}`,
          apiValidated: false,
          hasMediaZip: hasMediaZip,
        });
      }
    } catch (err) {
      setError("Failed to process CSV file: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !selectedContentType) {
      setError("No file or content type selected");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const strapiToken = JSON.parse(
        localStorage.getItem("strapi-admin-jwt") || "{}"
      );

      // Step 1: Upload media ZIP file if it exists
      let mediaFieldMappings = [];
      if (mediaZipFile) {
        try {
          // Use the csv-import plugin's upload endpoint to handle the single ZIP file
          const zipFormData = new FormData();
          zipFormData.append("zipFile", mediaZipFile);
          zipFormData.append("contentType", selectedContentType);
          zipFormData.append("matchField", upsertField);

          const uploadResponse = await fetch("/csv-import/upload-media-zip", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${strapiToken}`,
            },
            body: zipFormData,
          });

          if (uploadResponse.ok) {
            const uploadResult = await uploadResponse.json();
            mediaFieldMappings = uploadResult.data || [];
          } else {
            const errorData = await uploadResponse.json().catch(() => ({}));
            console.warn(`Failed to upload media ZIP file:`, errorData);
            setError(`Warning: Failed to upload media ZIP file. CSV import will continue without media files.`);
          }
        } catch (uploadError) {
          console.warn(`Error uploading media ZIP file:`, uploadError);
          setError(`Warning: Error uploading media ZIP file. CSV import will continue without media files.`);
        }
      }

      // Step 2: Create FormData for CSV import with media mappings
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upsert", upsertMode ? "true" : "false");
      formData.append("batchSize", "100");
      if (upsertMode) {
        formData.append("upsertField", upsertField);
      }

      // Include media field mappings if any
      if (mediaFieldMappings.length > 0) {
        formData.append("mediaFieldMappings", JSON.stringify(mediaFieldMappings));
      }

      // Step 3: Call the actual import API
      const response = await fetch(
        `/csv-import/import/${selectedContentType}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${strapiToken}`,
          },
          body: formData,
        }
      );

      if (response.ok) {
        const importResult = await response.json();
        const mediaInfo = mediaFieldMappings.length > 0 
          ? `, Media files uploaded from ZIP`
          : '';
        
        setResult((prev) => ({
          ...prev,
          imported: true,
          importResult: importResult.data,
          message: `✅ Successfully imported into ${
            contentTypes[selectedContentType]?.displayName
          }! Created: ${importResult.data.created || 0}, Updated: ${
            importResult.data.updated || 0
          }, Errors: ${importResult.data.errors?.length || 0}${
            upsertMode ? ` (Upsert mode: ${upsertField})` : ""
          }${mediaInfo}`,
        }));
      } else {
        const errorData = await response.json();
        setError(
          `Import failed: ${errorData.error?.message || "Unknown error"}`
        );
      }
    } catch (err) {
      setError("Import failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!exportContentType) {
      setExportMessage("Please select a content type to export");
      return;
    }

    setIsExporting(true);
    setExportMessage("Exporting data...");

    try {
      const strapiToken = JSON.parse(
        localStorage.getItem("strapi-admin-jwt") || "{}"
      );

      const response = await fetch(`/csv-import/export/${exportContentType}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${strapiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filters: {}, // Can be extended to include filters
        }),
      });

      if (response.ok) {
        // Handle file download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;

        // Extract filename from Content-Disposition header or create default
        const contentDisposition = response.headers.get("content-disposition");
        const filename = contentDisposition
          ? contentDisposition.split("filename=")[1]?.replace(/['"]/g, "")
          : `${exportContentType.replace("api::", "").replace(".", "_")}_export.csv`;

        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);

        setExportMessage("Export completed successfully!");
      } else {
        const errorText = await response.text();
        setExportMessage(`Export failed: ${errorText}`);
      }
    } catch (error) {
      setExportMessage(`Export failed: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return React.createElement(
    "div",
    { style: { padding: "24px", maxWidth: "800px" } },
    [
      // Title
      React.createElement(
        "h1",
        {
          key: "title",
          style: { fontSize: "28px", marginBottom: "8px", color: "#212134" },
        },
        "CSV Import/Export"
      ),

      React.createElement(
        "p",
        {
          key: "subtitle",
          style: { color: "#666687", marginBottom: "32px" },
        },
        "Import data from CSV files into your content types or export existing data with relation field information"
      ),

      // Upload Form
      React.createElement(
        "div",
        {
          key: "form",
          style: {
            background: "#ffffff",
            border: "1px solid #dcdce4",
            borderRadius: "4px",
            padding: "24px",
            marginBottom: "24px",
          },
        },
        [
          React.createElement(
            "h3",
            {
              key: "form-title",
              style: { margin: "0 0 20px 0", color: "#212134" },
            },
            "Upload Configuration"
          ),

          // Content Type Selection
          React.createElement(
            "div",
            { key: "content-type-section", style: { marginBottom: "20px" } },
            [
              React.createElement(
                "label",
                {
                  key: "ct-label",
                  style: {
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "600",
                    color: "#212134",
                  },
                },
                "Select Content Type"
              ),
              React.createElement(
                "select",
                {
                  key: "ct-select",
                  value: selectedContentType,
                  onChange: (e) =>
                    setSelectedContentType(e.currentTarget["value"]),
                  style: {
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #dcdce4",
                    borderRadius: "4px",
                    fontSize: "14px",
                  },
                },
                [
                  React.createElement(
                    "option",
                    { key: "default", value: "" },
                    "Choose a content type"
                  ),
                  ...Object.entries(contentTypes).map(([key, ct]) =>
                    React.createElement(
                      "option",
                      { key: key, value: key },
                      `${ct.displayName} (${key})`
                    )
                  ),
                ]
              ),
            ]
          ),

          // File Upload
          React.createElement(
            "div",
            { key: "file-section", style: { marginBottom: "20px" } },
            [
              React.createElement(
                "label",
                {
                  key: "file-label",
                  style: {
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "600",
                    color: "#212134",
                  },
                },
                "Select CSV File"
              ),
              React.createElement("input", {
                key: "file-input",
                type: "file",
                accept: ".csv",
                onChange: handleFileChange,
                style: {
                  width: "100%",
                  padding: "12px",
                  border: "1px solid #dcdce4",
                  borderRadius: "4px",
                  fontSize: "14px",
                },
              }),
              file &&
                React.createElement(
                  "p",
                  {
                    key: "file-info",
                    style: {
                      margin: "8px 0 0 0",
                      color: "#328048",
                      fontSize: "14px",
                    },
                  },
                  `✅ Selected: ${file.name} (${(file.size / 1024).toFixed(
                    1
                  )} KB)`
                ),
            ]
          ),

          // Media ZIP Upload
          React.createElement(
            "div",
            { key: "media-zip-section", style: { marginBottom: "20px" } },
            [
              React.createElement(
                "label",
                {
                  key: "media-zip-label",
                  style: {
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "600",
                    color: "#212134",
                  },
                },
                "Media Files ZIP (Optional)"
              ),
              React.createElement("input", {
                key: "media-zip-input",
                type: "file",
                accept: ".zip",
                onChange: handleMediaZipFileChange,
                style: {
                  width: "100%",
                  padding: "12px",
                  border: "1px solid #dcdce4",
                  borderRadius: "4px",
                  fontSize: "14px",
                },
              }),
              mediaZipFile &&
                React.createElement(
                  "p",
                  {
                    key: "media-zip-info",
                    style: {
                      margin: "8px 0 0 0",
                      color: "#328048",
                      fontSize: "14px",
                    },
                  },
                  `✅ Selected: ${mediaZipFile.name} (${(mediaZipFile.size / 1024).toFixed(1)} KB)`
                ),
              React.createElement(
                "p",
                {
                  key: "media-zip-help",
                  style: {
                    margin: "8px 0 0 0",
                    color: "#666687",
                    fontSize: "12px",
                    lineHeight: "1.4",
                  },
                },
                "Upload a ZIP file containing folders named after your media fields (e.g., reports/, lab_docs/). Files should be named with the match field value (e.g., test_ch_01.pdf, test_ch_02.pdf for challan_no 'test_ch')."
              ),
            ]
          ),

          // Upsert Configuration
          React.createElement(
            "div",
            { key: "upsert-section", style: { marginBottom: "20px" } },
            [
              React.createElement(
                "div",
                { key: "upsert-checkbox", style: { marginBottom: "12px" } },
                [
                  React.createElement(
                    "label",
                    {
                      key: "upsert-label",
                      style: {
                        display: "flex",
                        alignItems: "center",
                        fontSize: "14px",
                        color: "#212134",
                      },
                    },
                    [
                      React.createElement("input", {
                        key: "upsert-input",
                        type: "checkbox",
                        checked: upsertMode,
                        onChange: (e) => setUpsertMode(e.currentTarget.checked),
                        style: { marginRight: "8px" },
                      }),
                      "Update existing records (Upsert Mode)",
                    ]
                  ),
                ]
              ),

              upsertMode &&
                React.createElement("div", { key: "upsert-field-section" }, [
                  React.createElement(
                    "label",
                    {
                      key: "upsert-field-label",
                      style: {
                        display: "block",
                        marginBottom: "8px",
                        fontWeight: "600",
                        color: "#212134",
                      },
                    },
                    "Field to match for updates"
                  ),
                  React.createElement(
                    "select",
                    {
                      key: "upsert-field-select",
                      value: upsertField,
                      onChange: (e) => setUpsertField(e.currentTarget["value"]),
                      style: {
                        width: "100%",
                        padding: "12px",
                        border: "1px solid #dcdce4",
                        borderRadius: "4px",
                        fontSize: "14px",
                      },
                    },
                    [
                      React.createElement(
                        "option",
                        { key: "id-option", value: "id" },
                        "ID"
                      ),
                      ...(selectedContentType &&
                      contentTypes[selectedContentType]
                        ? Object.keys(
                            contentTypes[selectedContentType].attributes || {}
                          ).map((attr) => {
                            const attribute =
                              contentTypes[selectedContentType].attributes[
                                attr
                              ];
                            let fieldLabel = attr;

                            // Add type information for clarity
                            if (attribute.type) {
                              fieldLabel += ` (${attribute.type})`;
                            }

                            // Mark unique fields
                            if (attribute.unique) {
                              fieldLabel += " - unique";
                            }

                            // Mark required fields
                            if (attribute.required) {
                              fieldLabel += " - required";
                            }

                            return React.createElement(
                              "option",
                              { key: `${attr}-option`, value: attr },
                              fieldLabel
                            );
                          })
                        : []),
                    ]
                  ),
                  React.createElement(
                    "p",
                    {
                      key: "upsert-help",
                      style: {
                        margin: "8px 0 0 0",
                        fontSize: "12px",
                        color: "#666687",
                      },
                    },
                    "Select the field to match when updating existing records. Records with matching values will be updated instead of creating duplicates."
                  ),
                ]),
            ]
          ),

          // Upload Button
          React.createElement(
            "button",
            {
              key: "upload-btn",
              onClick: handleUpload,
              disabled: !file || !selectedContentType || loading,
              style: {
                background:
                  !file || !selectedContentType || loading
                    ? "#9096b3"
                    : "#4945ff",
                color: "white",
                border: "none",
                padding: "12px 24px",
                borderRadius: "4px",
                fontSize: "14px",
                cursor:
                  !file || !selectedContentType || loading
                    ? "not-allowed"
                    : "pointer",
                marginRight: "12px",
              },
            },
            loading ? "⏳ Processing..." : "📋 Upload & Validate"
          ),
        ]
      ),

      // Error Display
      error &&
        React.createElement(
          "div",
          {
            key: "error",
            style: {
              background: "#ffeaea",
              border: "1px solid #ee5e52",
              padding: "16px",
              borderRadius: "4px",
              marginBottom: "24px",
              color: "#d02b20",
            },
          },
          React.createElement(
            "pre",
            {
              key: "error-text",
              style: {
                margin: "0",
                fontFamily: "inherit",
                fontSize: "14px",
                lineHeight: "1.4",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              },
            },
            `❌ ${error}`
          )
        ),

      // Results Display
      result &&
        React.createElement(
          "div",
          {
            key: "results",
            style: {
              background: "#f0f8ff",
              border: "1px solid #4945ff",
              padding: "24px",
              borderRadius: "4px",
              marginBottom: "24px",
            },
          },
          [
            React.createElement(
              "h3",
              {
                key: "result-title",
                style: { margin: "0 0 16px 0", color: "#212134" },
              },
              "Validation Results"
            ),

            React.createElement("div", { key: "result-info" }, [
              React.createElement(
                "p",
                { key: "file-name" },
                `📄 File: ${result.fileName}`
              ),
              React.createElement(
                "p",
                { key: "content-type" },
                `📋 Content Type: ${
                  contentTypes[result.contentType]?.displayName
                }`
              ),
              React.createElement(
                "p",
                { key: "total-rows" },
                `📊 Total Rows: ${result.totalRows}`
              ),
              React.createElement(
                "p",
                { key: "headers" },
                `📝 Headers: ${result.headers.join(", ")}`
              ),

              result.sampleRows.length > 0 &&
                React.createElement("div", { key: "preview" }, [
                  React.createElement(
                    "p",
                    {
                      key: "preview-title",
                      style: { marginTop: "16px", fontWeight: "600" },
                    },
                    "Sample Data:"
                  ),
                  React.createElement(
                    "pre",
                    {
                      key: "preview-data",
                      style: {
                        background: "#f8f9fa",
                        padding: "12px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        overflow: "auto",
                      },
                    },
                    result.sampleRows.slice(0, 3).join("\n")
                  ),
                ]),

              React.createElement(
                "p",
                {
                  key: "status",
                  style: {
                    marginTop: "16px",
                    padding: "12px",
                    background: result.imported ? "#d4edda" : "#fff3cd",
                    borderRadius: "4px",
                    color: result.imported ? "#155724" : "#856404",
                  },
                },
                result.message
              ),

              !result.imported &&
                React.createElement(
                  "button",
                  {
                    key: "import-btn",
                    onClick: handleImport,
                    disabled: loading,
                    style: {
                      background: loading ? "#9096b3" : "#28a745",
                      color: "white",
                      border: "none",
                      padding: "12px 24px",
                      borderRadius: "4px",
                      fontSize: "14px",
                      cursor: loading ? "not-allowed" : "pointer",
                      marginTop: "16px",
                    },
                  },
                  loading ? "⏳ Importing..." : "🚀 Import Data"
                ),
            ]),
          ]
        ),

      // Export Section
      React.createElement(
        "div",
        {
          key: "export-form",
          style: {
            background: "#ffffff",
            border: "1px solid #dcdce4",
            borderRadius: "4px",
            padding: "24px",
            marginBottom: "24px",
          },
        },
        [
          React.createElement(
            "h3",
            {
              key: "export-title",
              style: { margin: "0 0 20px 0", color: "#212134" },
            },
            "Export Data"
          ),

          React.createElement(
            "p",
            {
              key: "export-subtitle",
              style: { 
                margin: "0 0 20px 0", 
                color: "#666687", 
                fontSize: "14px" 
              },
            },
            "Export content type data with ALL relation fields using dot notation (e.g., projects.name, location.name) and component fields (e.g., address.street, address.city)"
          ),

          // Content Type Selection for Export
          React.createElement(
            "div",
            { key: "export-content-type-section", style: { marginBottom: "20px" } },
            [
              React.createElement(
                "label",
                {
                  key: "export-ct-label",
                  style: {
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "600",
                    color: "#212134",
                  },
                },
                "Select Content Type to Export"
              ),
              React.createElement(
                "select",
                {
                  key: "export-ct-select",
                  value: exportContentType,
                  onChange: (e) => setExportContentType(e.currentTarget["value"]),
                  style: {
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #dcdce4",
                    borderRadius: "4px",
                    fontSize: "14px",
                  },
                },
                [
                  React.createElement(
                    "option",
                    { key: "export-default", value: "" },
                    "Choose a content type to export"
                  ),
                  ...Object.entries(contentTypes).map(([key, ct]) =>
                    React.createElement(
                      "option",
                      { key: `export-${key}`, value: key },
                      `${ct.displayName} (${key})`
                    )
                  ),
                ]
              ),
            ]
          ),

          // Export Button
          React.createElement(
            "button",
            {
              key: "export-btn",
              onClick: handleExport,
              disabled: !exportContentType || isExporting,
              style: {
                background:
                  !exportContentType || isExporting ? "#9096b3" : "#28a745",
                color: "white",
                border: "none",
                padding: "12px 24px",
                borderRadius: "4px",
                fontSize: "14px",
                cursor:
                  !exportContentType || isExporting ? "not-allowed" : "pointer",
                marginRight: "12px",
              },
            },
            isExporting ? "⏳ Exporting..." : "📥 Export to CSV"
          ),

          // Export Message
          exportMessage &&
            React.createElement(
              "div",
              {
                key: "export-message",
                style: {
                  marginTop: "16px",
                  padding: "12px",
                  borderRadius: "4px",
                  background: exportMessage.includes("successfully")
                    ? "#d4edda"
                    : exportMessage.includes("failed")
                    ? "#f8d7da"
                    : "#fff3cd",
                  color: exportMessage.includes("successfully")
                    ? "#155724"
                    : exportMessage.includes("failed")
                    ? "#721c24"
                    : "#856404",
                  border: exportMessage.includes("successfully")
                    ? "1px solid #c3e6cb"
                    : exportMessage.includes("failed")
                    ? "1px solid #f5c6cb"
                    : "1px solid #ffeaa7",
                },
              },
              exportMessage
            ),
        ]
      ),

      // Instructions (Collapsible)
      React.createElement(
        "div",
        {
          key: "instructions",
          style: {
            background: "#f6f6f9",
            border: "1px solid #dcdce4",
            borderRadius: "4px",
            overflow: "hidden",
          },
        },
        [
          // Header (Always Visible)
          React.createElement(
            "div",
            {
              key: "inst-header",
              onClick: () => setInstructionsExpanded(!instructionsExpanded),
              style: {
                padding: "16px 20px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: instructionsExpanded
                  ? "1px solid #dcdce4"
                  : "none",
                backgroundColor: instructionsExpanded ? "#f0f0f7" : "#f6f6f9",
              },
            },
            [
              React.createElement(
                "h3",
                {
                  key: "inst-title",
                  style: { margin: 0, color: "#212134", fontSize: "16px" },
                },
                "💡 Usage Instructions & Features"
              ),
              React.createElement(
                "span",
                {
                  key: "inst-toggle",
                  style: {
                    fontSize: "12px",
                    color: "#666687",
                    transform: instructionsExpanded
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  },
                },
                "▼"
              ),
            ]
          ),

          // Content (Collapsible)
          instructionsExpanded &&
            React.createElement(
              "div",
              {
                key: "inst-content",
                style: { padding: "20px" },
              },
              [
                // Basic Usage
                React.createElement(
                  "div",
                  { key: "basic-usage", style: { marginBottom: "24px" } },
                  [
                    React.createElement(
                      "h4",
                      {
                        key: "basic-title",
                        style: {
                          margin: "0 0 12px 0",
                          color: "#212134",
                          fontSize: "14px",
                          fontWeight: "600",
                        },
                      },
                      "📋 Basic Import Steps"
                    ),
                    React.createElement(
                      "ol",
                      {
                        key: "basic-list",
                        style: {
                          margin: 0,
                          paddingLeft: "20px",
                          fontSize: "14px",
                        },
                      },
                      [
                        React.createElement(
                          "li",
                          { key: "step1", style: { marginBottom: "4px" } },
                          "Select a content type from the dropdown"
                        ),
                        React.createElement(
                          "li",
                          { key: "step2", style: { marginBottom: "4px" } },
                          "Choose a CSV file with matching column headers"
                        ),
                        React.createElement(
                          "li",
                          { key: "step3", style: { marginBottom: "4px" } },
                          "Optional: Enable upsert mode to update existing records"
                        ),
                        React.createElement(
                          "li",
                          { key: "step4", style: { marginBottom: "4px" } },
                          'Click "Upload & Validate" to preview your data'
                        ),
                        React.createElement(
                          "li",
                          { key: "step5", style: { marginBottom: "4px" } },
                          'Review validation results and click "Import Data"'
                        ),
                      ]
                    ),
                  ]
                ),

                // Relation Fields
                React.createElement(
                  "div",
                  { key: "relations", style: { marginBottom: "24px" } },
                  [
                    React.createElement(
                      "h4",
                      {
                        key: "rel-title",
                        style: {
                          margin: "0 0 12px 0",
                          color: "#212134",
                          fontSize: "14px",
                          fontWeight: "600",
                        },
                      },
                      "🔗 Relation Fields Support"
                    ),
                    React.createElement(
                      "div",
                      {
                        key: "rel-content",
                        style: { fontSize: "14px", lineHeight: "1.5" },
                      },
                      [
                        React.createElement(
                          "p",
                          { key: "rel-desc", style: { margin: "0 0 8px 0" } },
                          "Link records using relations:"
                        ),
                        React.createElement(
                          "ul",
                          {
                            key: "rel-list",
                            style: { margin: 0, paddingLeft: "20px" },
                          },
                          [
                            React.createElement(
                              "li",
                              { key: "rel1" },
                              "Direct matching: country, user_id, category"
                            ),
                            React.createElement(
                              "li",
                              { key: "rel2" },
                              "Dot notation: country.name, user.email, category.slug"
                            ),
                            React.createElement(
                              "li",
                              { key: "rel3" },
                              'Multiple relations: "tag1,tag2,tag3" for many-to-many'
                            ),
                          ]
                        ),
                        React.createElement(
                          "div",
                          {
                            key: "rel-example",
                            style: {
                              background: "#f8f9fa",
                              padding: "12px",
                              borderRadius: "4px",
                              marginTop: "12px",
                              fontFamily: "monospace",
                              fontSize: "12px",
                            },
                          },
                          'Example: project_name,country.name,tags\\n"Project Alpha","India","mining,coal,green"'
                        ),
                      ]
                    ),
                  ]
                ),

                // Upsert Mode
                React.createElement(
                  "div",
                  { key: "upsert", style: { marginBottom: "24px" } },
                  [
                    React.createElement(
                      "h4",
                      {
                        key: "upsert-title",
                        style: {
                          margin: "0 0 12px 0",
                          color: "#212134",
                          fontSize: "14px",
                          fontWeight: "600",
                        },
                      },
                      "🔄 Upsert Mode (Update Existing)"
                    ),
                    React.createElement(
                      "div",
                      {
                        key: "upsert-content",
                        style: { fontSize: "14px", lineHeight: "1.5" },
                      },
                      [
                        React.createElement(
                          "p",
                          {
                            key: "upsert-desc",
                            style: { margin: "0 0 8px 0" },
                          },
                          "Update existing records instead of creating duplicates:"
                        ),
                        React.createElement(
                          "ul",
                          {
                            key: "upsert-list",
                            style: { margin: 0, paddingLeft: "20px" },
                          },
                          [
                            React.createElement(
                              "li",
                              { key: "up1" },
                              'Enable "Update existing records" checkbox'
                            ),
                            React.createElement(
                              "li",
                              { key: "up2" },
                              "Select field to match on (name, email, slug, etc.)"
                            ),
                            React.createElement(
                              "li",
                              { key: "up3" },
                              "Records with matching values will be updated"
                            ),
                            React.createElement(
                              "li",
                              { key: "up4" },
                              "New records will still be created if no match found"
                            ),
                          ]
                        ),
                      ]
                    ),
                  ]
                ),

                // Supported Data Types
                React.createElement(
                  "div",
                  { key: "datatypes", style: { marginBottom: "24px" } },
                  [
                    React.createElement(
                      "h4",
                      {
                        key: "dt-title",
                        style: {
                          margin: "0 0 12px 0",
                          color: "#212134",
                          fontSize: "14px",
                          fontWeight: "600",
                        },
                      },
                      "📊 Supported Data Types"
                    ),
                    React.createElement(
                      "div",
                      {
                        key: "dt-grid",
                        style: {
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "12px",
                          fontSize: "14px",
                        },
                      },
                      [
                        React.createElement("div", { key: "dt-col1" }, [
                          React.createElement(
                            "strong",
                            { key: "dt1-title" },
                            "Text & Numbers:"
                          ),
                          React.createElement(
                            "ul",
                            {
                              key: "dt1-list",
                              style: {
                                margin: "4px 0 0 0",
                                paddingLeft: "16px",
                              },
                            },
                            [
                              React.createElement(
                                "li",
                                { key: "dt1-1" },
                                "String, Text, Email"
                              ),
                              React.createElement(
                                "li",
                                { key: "dt1-2" },
                                "Integer, Decimal, Float"
                              ),
                              React.createElement(
                                "li",
                                { key: "dt1-3" },
                                "Boolean (true/false, 1/0, yes/no)"
                              ),
                            ]
                          ),
                        ]),
                        React.createElement("div", { key: "dt-col2" }, [
                          React.createElement(
                            "strong",
                            { key: "dt2-title" },
                            "Advanced:"
                          ),
                          React.createElement(
                            "ul",
                            {
                              key: "dt2-list",
                              style: {
                                margin: "4px 0 0 0",
                                paddingLeft: "16px",
                              },
                            },
                            [
                              React.createElement(
                                "li",
                                { key: "dt2-1" },
                                "Date, DateTime, Time"
                              ),
                              React.createElement(
                                "li",
                                { key: "dt2-2" },
                                "Enumeration (predefined values)"
                              ),
                              React.createElement(
                                "li",
                                { key: "dt2-3" },
                                "Relations (all types supported)"
                              ),
                            ]
                          ),
                        ]),
                      ]
                    ),
                  ]
                ),
              ]
            ),
        ]
      ),
    ]
  );
};

export default PluginPage;

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { read, utils } from 'https://esm.sh/xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { fileId, checkType, threshold = 95 } = await req.json();

    console.log('Received request:', { fileId, checkType, threshold });

    if (!fileId) {
      return new Response(
        JSON.stringify({ error: 'File ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get file metadata
    const { data: fileData, error: fileError } = await supabaseClient
      .from('uploaded_files')
      .select('*')
      .eq('id', fileId)
      .single();

    console.log('File data:', fileData);
    console.log('File error:', fileError);

    if (fileError || !fileData) {
      return new Response(
        JSON.stringify({ error: 'File not found', details: fileError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download file from storage
    console.log('Downloading file from storage:', fileData.storage_path);
    
    const { data: fileBlob, error: downloadError } = await supabaseClient
      .storage
      .from('data-files')
      .download(fileData.storage_path);

    console.log('Download error:', downloadError);
    console.log('File blob size:', fileBlob?.size);

    if (downloadError || !fileBlob) {
      return new Response(
        JSON.stringify({ 
          error: 'Failed to download file', 
          details: downloadError?.message || 'File blob is null',
          storage_path: fileData.storage_path 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse file content based on type
    let rows: any[] = [];
    let headers: string[] = [];

    const fileType = fileData.file_type?.toLowerCase() || '';
    const fileName = fileData.file_name?.toLowerCase() || '';

    console.log('File type:', fileType, 'File name:', fileName);

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileType.includes('spreadsheet') || fileType.includes('excel')) {
      try {
        // Parse Excel file
        console.log('Parsing as Excel file...');
        const arrayBuffer = await fileBlob.arrayBuffer();
        console.log('Array buffer size:', arrayBuffer.byteLength);
        
        const workbook = read(arrayBuffer, { type: 'array' });
        console.log('Workbook sheets:', workbook.SheetNames);
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = utils.sheet_to_json(worksheet, { header: 1 });
        
        console.log('Rows parsed:', jsonData.length);
        
        if (jsonData.length > 0) {
          headers = (jsonData[0] as any[]).map(h => String(h || '').trim());
          rows = jsonData.slice(1).map((rowArray: any) => {
            const row: any = {};
            headers.forEach((header, idx) => {
              row[header] = rowArray[idx] !== undefined && rowArray[idx] !== null ? String(rowArray[idx]) : '';
            });
            return row;
          });
        }
        console.log('Headers:', headers);
        console.log('Data rows:', rows.length);
      } catch (parseError: any) {
        console.error('Excel parsing error:', parseError);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to parse Excel file', 
            details: parseError.message,
            stack: parseError.stack 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (fileName.endsWith('.csv') || fileType.includes('csv')) {
      try {
        // Parse CSV file
        console.log('Parsing as CSV file...');
        const fileContent = await fileBlob.text();
        const lines = fileContent.split('\n').filter(line => line.trim());
        
        if (lines.length > 0) {
          headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
          rows = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const row: any = {};
            headers.forEach((header, idx) => {
              row[header] = values[idx] || '';
            });
            return row;
          });
        }
        console.log('Headers:', headers);
        console.log('Data rows:', rows.length);
      } catch (parseError: any) {
        console.error('CSV parsing error:', parseError);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to parse CSV file', 
            details: parseError.message 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (fileName.endsWith('.json') || fileType.includes('json')) {
      try {
        // Parse JSON file
        console.log('Parsing as JSON file...');
        const fileContent = await fileBlob.text();
        const jsonData = JSON.parse(fileContent);
        rows = Array.isArray(jsonData) ? jsonData : [jsonData];
        
        if (rows.length > 0) {
          headers = Object.keys(rows[0]);
        }
        console.log('Headers:', headers);
        console.log('Data rows:', rows.length);
      } catch (parseError: any) {
        console.error('JSON parsing error:', parseError);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to parse JSON file', 
            details: parseError.message 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      return new Response(
        JSON.stringify({ error: 'Unsupported file type. Please upload CSV, Excel, or JSON files.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No data found in file' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting quality analysis...');

    // Perform quality analysis based on check type
    const totalRecords = rows.length;
    let passedRecords = 0;
    let failedRecords = 0;
    const issues: any[] = [];

    switch (checkType) {
      case 'completeness':
        // Check for missing/empty values
        const missingByColumn: Record<string, number> = {};
        headers.forEach(header => { missingByColumn[header] = 0; });

        rows.forEach(row => {
          let rowComplete = true;
          headers.forEach(header => {
            const value = row[header];
            if (value === null || value === undefined || value === '' || value === 'null' || value === 'undefined') {
              missingByColumn[header]++;
              rowComplete = false;
            }
          });
          if (rowComplete) passedRecords++;
          else failedRecords++;
        });

        // Generate issues for columns with missing data
        Object.entries(missingByColumn).forEach(([column, count]) => {
          if (count > 0) {
            issues.push({
              type: `Missing values in "${column}"`,
              count,
              severity: count > totalRecords * 0.1 ? 'high' : count > totalRecords * 0.05 ? 'medium' : 'low',
              column
            });
          }
        });
        break;

      case 'accuracy':
        // Check for data type consistency and valid ranges
        const typeIssues: Record<string, number> = {};
        
        rows.forEach(row => {
          let rowAccurate = true;
          headers.forEach(header => {
            const value = row[header];
            if (value && value !== '') {
              // Check if numeric columns contain valid numbers
              if (!isNaN(Number(value))) {
                const num = Number(value);
                if (num < -1000000 || num > 1000000000) {
                  typeIssues[`Out of range: ${header}`] = (typeIssues[`Out of range: ${header}`] || 0) + 1;
                  rowAccurate = false;
                }
              }
            }
          });
          if (rowAccurate) passedRecords++;
          else failedRecords++;
        });

        Object.entries(typeIssues).forEach(([issue, count]) => {
          issues.push({
            type: issue,
            count,
            severity: count > totalRecords * 0.1 ? 'high' : 'medium'
          });
        });
        break;

      case 'consistency':
        // Check for duplicate rows
        const uniqueRows = new Set(rows.map(row => JSON.stringify(row)));
        const duplicates = totalRecords - uniqueRows.size;
        
        if (duplicates > 0) {
          issues.push({
            type: 'Duplicate records',
            count: duplicates,
            severity: duplicates > totalRecords * 0.05 ? 'high' : 'medium'
          });
          failedRecords = duplicates;
          passedRecords = totalRecords - duplicates;
        } else {
          passedRecords = totalRecords;
        }
        break;

      case 'validity':
        // Check for valid formats (emails, dates, etc.)
        const formatIssues: Record<string, number> = {};
        
        rows.forEach(row => {
          let rowValid = true;
          headers.forEach(header => {
            const value = String(row[header] || '');
            const lowerHeader = header.toLowerCase();
            
            // Email validation
            if (lowerHeader.includes('email') && value && value !== '') {
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                formatIssues[`Invalid email format in "${header}"`] = (formatIssues[`Invalid email format in "${header}"`] || 0) + 1;
                rowValid = false;
              }
            }
            
            // Date validation
            if ((lowerHeader.includes('date') || lowerHeader.includes('time')) && value && value !== '') {
              if (isNaN(Date.parse(value))) {
                formatIssues[`Invalid date format in "${header}"`] = (formatIssues[`Invalid date format in "${header}"`] || 0) + 1;
                rowValid = false;
              }
            }
          });
          if (rowValid) passedRecords++;
          else failedRecords++;
        });

        Object.entries(formatIssues).forEach(([issue, count]) => {
          issues.push({
            type: issue,
            count,
            severity: count > totalRecords * 0.1 ? 'high' : 'medium'
          });
        });
        break;

      case 'uniqueness':
        // Check for unique identifiers
        const uniquenessIssues: Record<string, number> = {};
        
        headers.forEach(header => {
          const lowerHeader = header.toLowerCase();
          if (lowerHeader.includes('id') || lowerHeader.includes('key') || lowerHeader.includes('code')) {
            const values = rows.map(row => row[header]);
            const uniqueValues = new Set(values.filter(v => v !== null && v !== undefined && v !== ''));
            const duplicateCount = values.length - uniqueValues.size;
            
            if (duplicateCount > 0) {
              uniquenessIssues[`Duplicate values in "${header}"`] = duplicateCount;
            }
          }
        });

        if (Object.keys(uniquenessIssues).length > 0) {
          Object.entries(uniquenessIssues).forEach(([issue, count]) => {
            issues.push({
              type: issue,
              count,
              severity: 'high'
            });
          });
          failedRecords = Object.values(uniquenessIssues).reduce((sum, count) => sum + count, 0);
          passedRecords = totalRecords - failedRecords;
        } else {
          passedRecords = totalRecords;
        }
        break;

      case 'timeliness':
        // Check for outdated or future dates
        const timeIssues: Record<string, number> = {};
        const now = new Date();
        
        rows.forEach(row => {
          let rowTimely = true;
          headers.forEach(header => {
            const value = row[header];
            const lowerHeader = header.toLowerCase();
            
            if ((lowerHeader.includes('date') || lowerHeader.includes('time')) && value && value !== '') {
              const date = new Date(value);
              if (!isNaN(date.getTime())) {
                // Check if date is more than 2 years old
                const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
                if (date < twoYearsAgo) {
                  timeIssues[`Outdated records in "${header}"`] = (timeIssues[`Outdated records in "${header}"`] || 0) + 1;
                  rowTimely = false;
                }
                // Check if date is in the future
                if (date > now) {
                  timeIssues[`Future dates in "${header}"`] = (timeIssues[`Future dates in "${header}"`] || 0) + 1;
                  rowTimely = false;
                }
              }
            }
          });
          if (rowTimely) passedRecords++;
          else failedRecords++;
        });

        Object.entries(timeIssues).forEach(([issue, count]) => {
          issues.push({
            type: issue,
            count,
            severity: count > totalRecords * 0.2 ? 'medium' : 'low'
          });
        });
        break;

      default:
        // Generic check
        passedRecords = totalRecords;
        failedRecords = 0;
    }

    const qualityScore = totalRecords > 0 ? (passedRecords / totalRecords) * 100 : 0;
    const status = qualityScore >= threshold ? 'passed' : qualityScore >= 80 ? 'warning' : 'failed';

    console.log('Analysis complete:', { totalRecords, passedRecords, failedRecords, qualityScore });

    return new Response(
      JSON.stringify({
        success: true,
        result: {
          records_checked: totalRecords,
          records_passed: passedRecords,
          records_failed: failedRecords,
          quality_score: Math.round(qualityScore * 10) / 10,
          issues_found: issues.slice(0, 10),
          status,
          file_name: fileData.file_name,
          columns_analyzed: headers.length,
          check_type: checkType
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error', 
        details: error.toString(),
        stack: error.stack 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
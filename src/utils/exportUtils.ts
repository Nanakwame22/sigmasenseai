import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Export to PDF
export const exportToPDF = (
  title: string,
  data: any[],
  columns: { header: string; dataKey: string }[],
  options?: {
    orientation?: 'portrait' | 'landscape';
    includeDate?: boolean;
    includeStats?: { label: string; value: string | number }[];
  }
) => {
  const doc = new jsPDF({
    orientation: options?.orientation || 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Add title
  doc.setFontSize(18);
  doc.setTextColor(20, 184, 166); // Teal color
  doc.text(title, 14, 20);

  // Add date if requested
  if (options?.includeDate) {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
  }

  let startY = options?.includeDate ? 35 : 28;

  // Add statistics if provided
  if (options?.includeStats && options.includeStats.length > 0) {
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Summary Statistics:', 14, startY);
    startY += 7;

    options.includeStats.forEach((stat, index) => {
      doc.setFontSize(10);
      doc.setTextColor(60);
      doc.text(`${stat.label}: ${stat.value}`, 14, startY + index * 6);
    });

    startY += options.includeStats.length * 6 + 5;
  }

  // Add table
  autoTable(doc, {
    head: [columns.map((col) => col.header)],
    body: data.map((row) => columns.map((col) => row[col.dataKey] || '')),
    startY,
    theme: 'striped',
    headStyles: {
      fillColor: [20, 184, 166],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
  });

  // Save the PDF
  const fileName = `${title.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;
  doc.save(fileName);
};

// Export to CSV
export const exportToCSV = (data: any[], filename: string, columns?: string[]) => {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  // Get headers
  const headers = columns || Object.keys(data[0]);

  // Create CSV content
  const csvContent = [
    headers.join(','),
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          // Handle values with commas or quotes
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value ?? '';
        })
        .join(',')
    ),
  ].join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().getTime()}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Export to JSON
export const exportToJSON = (data: any[], filename: string) => {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().getTime()}.json`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Export to Excel
export const exportToExcel = (
  data: any[],
  filename: string,
  sheetName: string = 'Sheet1',
  options?: {
    includeStats?: { label: string; value: string | number }[];
    columns?: string[];
  }
) => {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Prepare data
  let wsData: any[] = [];

  // Add statistics if provided
  if (options?.includeStats && options.includeStats.length > 0) {
    wsData.push(['Summary Statistics']);
    wsData.push([]);
    options.includeStats.forEach((stat) => {
      wsData.push([stat.label, stat.value]);
    });
    wsData.push([]);
    wsData.push([]);
  }

  // Filter columns if specified
  const filteredData = options?.columns
    ? data.map((row) => {
        const filtered: any = {};
        options.columns!.forEach((col) => {
          filtered[col] = row[col];
        });
        return filtered;
      })
    : data;

  // Convert data to worksheet
  const ws = XLSX.utils.json_to_sheet(filteredData, {
    origin: wsData.length > 0 ? `A${wsData.length + 1}` : 'A1',
  });

  // Add stats to worksheet if present
  if (wsData.length > 0) {
    XLSX.utils.sheet_add_aoa(ws, wsData, { origin: 'A1' });
  }

  // Auto-size columns
  const maxWidth = 50;
  const colWidths = Object.keys(filteredData[0] || {}).map((key) => {
    const maxLength = Math.max(
      key.length,
      ...filteredData.map((row) => String(row[key] || '').length)
    );
    return { wch: Math.min(maxLength + 2, maxWidth) };
  });
  ws['!cols'] = colWidths;

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Save file
  XLSX.writeFile(wb, `${filename}_${new Date().getTime()}.xlsx`);
};

// Import from CSV
export const importFromCSV = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter((line) => line.trim());

        if (lines.length === 0) {
          reject(new Error('File is empty'));
          return;
        }

        // Parse headers
        const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));

        // Parse data
        const data = lines.slice(1).map((line) => {
          const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
          const row: any = {};

          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });

          return row;
        });

        resolve(data);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

// Import from Excel
export const importFromExcel = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });

        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          reject(new Error('No data found in file'));
          return;
        }

        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsBinaryString(file);
  });
};

// Download template
export const downloadTemplate = (
  templateName: string,
  columns: { name: string; description?: string; example?: string }[]
) => {
  const headers = columns.map((col) => col.name);
  const descriptions = columns.map((col) => col.description || '');
  const examples = columns.map((col) => col.example || '');

  const wb = XLSX.utils.book_new();

  // Create worksheet with headers, descriptions, and examples
  const wsData = [headers, descriptions, examples];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Style header row
  ws['!cols'] = headers.map(() => ({ wch: 20 }));

  XLSX.utils.book_append_sheet(wb, ws, 'Template');

  // Save file
  XLSX.writeFile(wb, `${templateName}_template.xlsx`);
};

// Export chart as image
export const exportChartAsImage = (chartId: string, filename: string) => {
  const chartElement = document.getElementById(chartId);

  if (!chartElement) {
    alert('Chart not found');
    return;
  }

  // Use html2canvas or similar library
  import('html2canvas').then((html2canvas) => {
    html2canvas.default(chartElement).then((canvas) => {
      const link = document.createElement('a');
      link.download = `${filename}_${new Date().getTime()}.png`;
      link.href = canvas.toDataURL();
      link.click();
    });
  });
};

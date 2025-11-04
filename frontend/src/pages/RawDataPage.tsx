import React, { useEffect, useState } from 'react'
import {
  Paper,
  Typography,
  Stack,
  Button,
  Tooltip,
  Tabs,
  Tab,
  Box,
  TextField
} from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { DataGrid, GridColDef } from '@mui/x-data-grid'
import { getRaw, ingestJson, uploadCsv } from '../lib/api'

export default function RawDataPage() {
  const [rows, setRows] = useState<any[]>([])
  const [count, setCount] = useState(0)
  const [tab, setTab] = useState(0)
  const [jsonText, setJsonText] = useState('')

  // -----------------------------
  // Fetching Data
  // -----------------------------
  async function refresh() {
    const res = await getRaw(200)
    if (res?.ok) {
      setCount(res.total_rows || res.count || 0)
      setRows((res.preview || []).map((r: any, i: number) => ({ id: i + 1, ...r })))
    }
  }

  useEffect(() => { refresh() }, [])

  // -----------------------------
  // DataGrid columns usage
  // -----------------------------
  const cols: GridColDef[] = Object.keys(rows[0] || {})
    .filter(k => k !== 'id')
    .map(k => ({
      field: k,
      headerName: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      flex: 1,
      minWidth: 140
    }))

  // -----------------------------
  // Handlers for the refresh
  // -----------------------------
  async function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    await uploadCsv(f)
    await refresh()
  }

  async function onJsonIngest() {
    try {
      const parsed = JSON.parse(jsonText)
      await ingestJson(parsed)
      await refresh()
      setJsonText('')
    } catch {
      alert('Invalid JSON format. Please paste valid ACN API JSON.')
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #e0f2f1 100%)',
        py: 3,
        px: { xs: 1, sm: 3 }
      }}
    >
      <Stack spacing={3}>
        <Typography variant="h4" fontWeight={600} color="primary.main">
          🧩 Raw Data
        </Typography>

        <Paper
          elevation={3}
          sx={{
            p: 2,
            borderRadius: 3,
            bgcolor: '#ffffffd9',
            backdropFilter: 'blur(6px)'
          }}
        >
          <Typography variant="h6" gutterBottom>
            📤 Upload or Ingest Data
          </Typography>

          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            textColor="primary"
            indicatorColor="primary"
            sx={{ mb: 2 }}
          >
            <Tab label="Upload CSV" />
            <Tab label="Paste JSON (ACN API)" />
          </Tabs>

          {/* Upload CSV Code */}
          {tab === 0 && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <Button
                variant="contained"
                component="label"
                sx={{ textTransform: 'none', borderRadius: 2 }}
              >
                Upload CSV
                <input type="file" accept=".csv" hidden onChange={onCsv} />
              </Button>
              <Tooltip title="Upload ACN or similar CSV file with timestamps and energy readings.">
                <Stack direction="row" alignItems="center" spacing={1}>
                  <InfoOutlinedIcon fontSize="small" color="action" />
                  <Typography variant="body2" color="text.secondary">
                    Supported: CSV with connection/disconnect time & kWh columns
                  </Typography>
                </Stack>
              </Tooltip>
            </Stack>
          )}

          {/* Ingest JSON Code */}
          {tab === 1 && (
            <Stack spacing={1}>
              <TextField
                multiline
                minRows={6}
                value={jsonText}
                onChange={e => setJsonText(e.target.value)}
                label="Paste ACN JSON here"
                variant="outlined"
                sx={{ bgcolor: '#fafafa', borderRadius: 1 }}
              />
              <Button
                variant="contained"
                color="primary"
                onClick={onJsonIngest}
                sx={{ alignSelf: 'flex-start', textTransform: 'none', borderRadius: 2 }}
              >
                Ingest JSON
              </Button>
            </Stack>
          )}
        </Paper>

        <Paper
          elevation={3}
          sx={{
            p: 2,
            borderRadius: 3,
            bgcolor: '#ffffffd9',
            backdropFilter: 'blur(6px)'
          }}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: 1 }}
          >
            <Typography variant="h6" color="primary.main">
              📊 Dataset Preview
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={refresh}
              sx={{ textTransform: 'none', borderRadius: 2 }}
            >
              Refresh
            </Button>
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Showing first {rows.length} of {count} records
          </Typography>

          <div style={{ height: 520, width: '100%' }}>
            <DataGrid
              rows={rows}
              columns={cols}
              disableRowSelectionOnClick
              density="compact"
              sx={{
                border: 'none',
                '& .MuiDataGrid-row:nth-of-type(odd)': {
                  backgroundColor: '#f9f9f9'
                },
                '& .MuiDataGrid-columnHeaders': {
                  backgroundColor: '#e0f2f1',
                  fontWeight: 700,
                  fontSize: '0.9rem'
                },
                '& .MuiDataGrid-columnHeaderTitleContainer': {
                  justifyContent: 'center'
                }
              }}
            />
          </div>
        </Paper>
      </Stack>
    </Box>
  )
}

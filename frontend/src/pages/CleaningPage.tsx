import React, { useEffect, useState } from 'react'
import {
  Paper,
  Typography,
  Stack,
  Select,
  MenuItem,
  Tooltip,
  IconButton,
  Box,
  Chip,
  Divider,
  TextField
} from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { DataGrid, GridColDef } from '@mui/x-data-grid'
import { getClean } from '../lib/api'

export default function CleaningPage() {
  const [freq, setFreq] = useState<'H' | 'D'>('H')
  const [site, setSite] = useState<string | undefined>(undefined)
  const [rows, setRows] = useState<any[]>([])
  const [stats, setStats] = useState<any>({})
  const [nullCols, setNullCols] = useState<string[]>([])
  const [limit, setLimit] = useState<number>(200)
  const MAX_LIMIT = 1000

  const COLUMN_INFO: Record<string, { label: string; tooltip: string }> = {
    ts: { label: 'Timestamp', tooltip: 'Date and time of the aggregated interval' },
    energy_kwh: { label: 'Energy (kWh)', tooltip: 'Total energy delivered during this time period' },
    sessions: { label: 'Sessions', tooltip: 'Number of charging sessions in this time bucket' },
    WhPerMile: { label: 'Wh Per Mile', tooltip: 'Average energy consumption per mile (if available)' },
    kWhRequested: { label: 'kWh Requested', tooltip: 'Average energy amount requested by users' },
    milesRequested: { label: 'Miles Requested', tooltip: 'Average miles requested by users' },
    minutesAvailable: { label: 'Minutes Available', tooltip: 'Average duration charging stations were available' },
    paid_sessions: { label: 'Paid Sessions', tooltip: 'Number of sessions marked as paid (paymentRequired=True)' },
    identified_users: { label: 'Identified Users', tooltip: 'Count of sessions with known registered users' },
  }

  async function refresh() {
    const safeLimit = Math.min(limit, MAX_LIMIT)
    const res = await getClean(freq, site || null, safeLimit)
    if (res?.ok) {
      setStats(res)
      setNullCols(Object.keys(res.null_counts || {}).filter(k => res.null_counts[k] > 0))
      setRows((res.preview || []).map((r: any, i: number) => ({ id: i + 1, ...r })))
    }
  }

  useEffect(() => { refresh() }, [freq, site, limit])
  const cols: GridColDef[] = Object.keys(rows[0] || {})
    .filter(k => k !== 'id')
    .map(k => {
      const info = COLUMN_INFO[k] || { label: k, tooltip: k }
      return {
        field: k,
        headerName: info.label,
        flex: 1,
        minWidth: 130,
        renderHeader: () => (
          <Tooltip title={info.tooltip}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {info.label}
            </Typography>
          </Tooltip>
        ),
        renderCell: (params) => {
          const val = params.value
          const isNull = val === null || val === undefined || val === ''
          const isFlagged = nullCols.includes(k)
          return (
            <Box
              sx={{
                bgcolor: isNull ? '#ffebee' : 'transparent',
                color: isNull ? '#c62828' : 'inherit',
                px: 1,
                borderRadius: 1,
                fontWeight: isFlagged ? 600 : 400,
              }}
            >
              {isNull ? '⚠️ Missing' : String(val)}
            </Box>
          )
        }
      }
    })

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
          🧹 Cleaning & Aggregation
        </Typography>

        {/* Controls */}
        <Paper elevation={3} sx={{ p: 2, borderRadius: 3, bgcolor: '#ffffffd9' }}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <Typography variant="body1" fontWeight={500}>Frequency</Typography>
            <Select
              size="small"
              value={freq}
              onChange={(e) => setFreq(e.target.value as any)}
              sx={{ minWidth: 120, bgcolor: '#f9f9f9', borderRadius: 1 }}
            >
              <MenuItem value="H">Hourly</MenuItem>
              <MenuItem value="D">Daily</MenuItem>
            </Select>
            <Tooltip title="Group sessions into hourly/daily buckets and compute energy + session summaries.">
              <IconButton size="small"><InfoOutlinedIcon fontSize="small" /></IconButton>
            </Tooltip>

            {/* Row Limit Control */}
            <Tooltip title="How many rows of preview data to fetch (max 1000)">
              <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 3 }}>
                <Typography variant="body2" fontWeight={500}>Rows:</Typography>
                <TextField
                  size="small"
                  type="number"
                  value={limit}
                  onChange={(e) => {
                    const val = Math.min(Math.max(10, Number(e.target.value) || 10), MAX_LIMIT)
                    setLimit(val)
                  }}
                  inputProps={{ min: 10, max: MAX_LIMIT }}
                  sx={{ width: 90, bgcolor: '#f9f9f9', borderRadius: 1 }}
                />
              </Stack>
            </Tooltip>
          </Stack>
        </Paper>

        {/* Summary */}
        {stats?.null_counts && (
          <Paper elevation={2} sx={{ p: 2, borderRadius: 3, bgcolor: '#fefefe' }}>
            <Typography variant="subtitle1" gutterBottom>🧾 Data Summary</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {stats.message}
            </Typography>
            <Divider sx={{ mb: 1 }} />
            <Typography variant="body2" fontWeight={500}>Columns with missing values:</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" mt={1}>
              {nullCols.length > 0
                ? nullCols.map(c => (
                  <Chip
                    key={c}
                    label={`${COLUMN_INFO[c]?.label || c} (${stats.null_counts[c]})`}
                    color="error"
                    variant="outlined"
                  />
                ))
                : <Chip label="None" color="success" variant="outlined" />}
            </Stack>
          </Paper>
        )}

        {/* Table */}
        <Paper elevation={3} sx={{ p: 2, borderRadius: 3, bgcolor: '#ffffffd9' }}>
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
            📋 Aggregated Result Preview ({rows.length} of {limit} rows)
          </Typography>
          <div style={{ height: 520, width: '100%' }}>
            <DataGrid
              rows={rows}
              columns={cols}
              density="compact"
              disableRowSelectionOnClick
              sx={{
                border: 'none',
                '& .MuiDataGrid-row:nth-of-type(odd)': {
                  backgroundColor: '#f9f9f9',
                },
                '& .MuiDataGrid-columnHeaders': {
                  backgroundColor: '#e0f2f1',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                },
                '& .MuiDataGrid-columnHeaderTitleContainer': {
                  justifyContent: 'center',
                },
              }}
            />
          </div>
        </Paper>
      </Stack>
    </Box>
  )
}

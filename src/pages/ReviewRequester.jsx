import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  LinearProgress,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import usePersistentState from "../hooks/usePersistentState";
import { MSG, sendMessage } from "../utils/messaging";

const STATUS_LABELS = {
  idle: "Idle",
  discovering: "Discovering orders…",
  processing: "Processing orders…",
  completed: "Completed",
  stopped: "Stopped",
};

const COUNTER_CONFIG = [
  { key: "discoveredCount", label: "Discovered", color: "default" },
  { key: "queuedCount", label: "Queued", color: "default" },
  { key: "processedCount", label: "Processed", color: "default" },
  { key: "requestedCount", label: "Requested", color: "success" },
  { key: "alreadyRequestedCount", label: "Already Req.", color: "warning" },
  { key: "tooEarlyCount", label: "Too Early", color: "info" },
  { key: "failedCount", label: "Failed", color: "error" },
];

const ORDERS_PER_PAGE = 10;

export default function ReviewRequester() {
  const [runState, setRunState] = useState(null);
  const [error, setError] = useState(null);
  const [orders, setOrders] = useState([]);
  const [page, setPage] = usePersistentState("reviews.page", 0);

  // Schedule state
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleUrl, setScheduleUrl] = useState("");
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState(null);
  const [lastRun, setLastRun] = useState(null);

  const refreshState = useCallback(async () => {
    const state = await sendMessage({ type: MSG.GET_STATE });
    if (state) setRunState(state);
  }, []);

  useEffect(() => {
    refreshState();
    loadSchedule();
    loadOrders();

    const listener = (message) => {
      if (message.type === MSG.STATE_UPDATE) {
        setRunState(message.payload);
        if (message.payload?.error) setError(message.payload.error);
      }
      if (message.type === MSG.REQUESTED_ORDERS_UPDATE) {
        setOrders(message.orders || []);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [refreshState]);

  const loadSchedule = async () => {
    const schedule = await sendMessage({ type: MSG.GET_SCHEDULE });
    if (schedule) {
      setScheduleEnabled(schedule.enabled);
      setScheduleTime(schedule.time || "09:00");
      setScheduleUrl(schedule.ordersUrl || "");
    }
    // Fetch last run date from storage
    chrome.storage.local.get("sellerforge-last-run-date", (result) => {
      setLastRun(result["sellerforge-last-run-date"] || null);
    });
  };

  const loadOrders = async () => {
    const res = await sendMessage({ type: MSG.GET_REQUESTED_ORDERS });
    if (res?.ok) setOrders(res.orders || []);
  };

  const handleStart = async () => {
    setError(null);
    await sendMessage({ type: MSG.START_RUN });
  };

  const handleStop = async () => {
    await sendMessage({ type: MSG.STOP_RUN });
  };

  const handleSaveSchedule = async () => {
    if (scheduleEnabled && !scheduleUrl.trim()) {
      setError("Please enter your Manage Orders page URL");
      return;
    }
    setScheduleSaving(true);
    const res = await sendMessage({
      type: MSG.SET_SCHEDULE,
      payload: {
        enabled: scheduleEnabled,
        time: scheduleTime,
        ordersUrl: scheduleUrl,
      },
    });
    setScheduleSaving(false);
    if (res?.ok) {
      setScheduleMsg(
        scheduleEnabled ? `Saved — next run at ${scheduleTime}` : "Schedule disabled"
      );
      setTimeout(() => setScheduleMsg(null), 3000);
    }
  };

  const isRunning =
    runState?.status === "discovering" || runState?.status === "processing";

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Controls */}
      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={handleStart}
          disabled={isRunning}
          sx={{ flex: 1 }}
        >
          Start
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={<StopIcon />}
          onClick={handleStop}
          disabled={!isRunning}
          sx={{ flex: 1 }}
        >
          Stop
        </Button>
      </Stack>

      {/* Status */}
      {runState && (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Status:
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {STATUS_LABELS[runState.status] || runState.status}
            </Typography>
          </Stack>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 0.75 }}
          >
            {isRunning ? "Current run" : "Latest run"}
          </Typography>

          {isRunning && (
            <LinearProgress
              variant={runState.totalInQueue > 0 ? "determinate" : "indeterminate"}
              value={
                runState.totalInQueue > 0
                  ? (runState.currentIndex / runState.totalInQueue) * 100
                  : 0
              }
              sx={{ mb: 1, borderRadius: 1 }}
            />
          )}

          {isRunning && runState.currentOrderId && (
            <Typography variant="caption" color="text.secondary">
              Processing: <strong>{runState.currentOrderId}</strong>{" "}
              ({runState.currentIndex} / {runState.totalInQueue})
            </Typography>
          )}

          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
            {COUNTER_CONFIG.map((c) => (
              <Chip
                key={c.key}
                label={`${c.label}: ${runState[c.key] ?? 0}`}
                size="small"
                color={c.color}
                variant="outlined"
              />
            ))}
          </Box>
        </Paper>
      )}

      {/* Error */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Divider />

      {/* Requested Orders */}
      <Typography variant="subtitle2" fontWeight={600}>
        Requested Reviews
      </Typography>

      {orders.length === 0 ? (
        <Typography variant="body2" color="text.secondary" textAlign="center">
          No requested orders yet.
        </Typography>
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, width: 30 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Order ID</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Requested</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders
                  .slice(page * ORDERS_PER_PAGE, (page + 1) * ORDERS_PER_PAGE)
                  .map((order, i) => (
                    <TableRow key={order.orderId} hover>
                      <TableCell>{page * ORDERS_PER_PAGE + i + 1}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>
                        {order.orderId}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11 }}>
                        {formatDate(order.lastRequestedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
          {orders.length > ORDERS_PER_PAGE && (
            <TablePagination
              component="div"
              count={orders.length}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={ORDERS_PER_PAGE}
              rowsPerPageOptions={[]}
            />
          )}
        </>
      )}

      <Divider />

      {/* Schedule */}
      <Box>
        <FormControlLabel
          control={
            <Switch
              checked={scheduleEnabled}
              onChange={(e) => setScheduleEnabled(e.target.checked)}
              color="primary"
            />
          }
          label={
            <Typography variant="subtitle2" fontWeight={600}>
              Daily Schedule
            </Typography>
          }
        />
        {/* Last run date display */}
        <Box sx={{ mt: 1, mb: scheduleEnabled ? 0 : 2 }}>
          <Typography variant="caption" color="text.secondary">
            Last run: {lastRun ? formatLastRun(lastRun) : "Never"}
          </Typography>
        </Box>
        {scheduleEnabled && (
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              label="Run at"
              type="time"
              size="small"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Orders page URL"
              size="small"
              placeholder="https://sellercentral.amazon.ca/orders-v3"
              value={scheduleUrl}
              onChange={(e) => setScheduleUrl(e.target.value)}
            />
            <Button
              variant="contained"
              size="small"
              onClick={handleSaveSchedule}
              disabled={scheduleSaving}
            >
              {scheduleSaving ? "Saving…" : "Save schedule"}
            </Button>
            {scheduleMsg && (
              <Typography variant="caption" color="success.main" textAlign="center">
                {scheduleMsg}
              </Typography>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

function formatDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

function formatLastRun(dateStr) {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  if (!isNaN(d)) {
    return (
      d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    );
  }
  // fallback: show as is
  return dateStr;
}

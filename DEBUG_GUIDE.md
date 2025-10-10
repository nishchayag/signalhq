# 🐛 Debugging the Question Messages Issue

## Current Problem

- Question shows "1 responses" in the sidebar
- But clicking on the question shows "No responses yet"
- Debug logs show: `All messages in database: 5` but `Messages with questionId field: 0`

## Root Cause

The existing message was likely created before we added the `questionId` field to the Message model, so it doesn't have a `questionId` reference.

## Solution Steps

### 1. **Test New Response Submission**

1. Go to your dashboard: http://localhost:3001/dashboard
2. Click on your question in the sidebar
3. Click "Copy Link"
4. Open the question link in a new tab/incognito window
5. Submit a response
6. Go back to dashboard and click "Refresh" on the question

This will test if new responses are being saved correctly with `questionId`.

### 2. **Check Existing Messages**

The debug logs will show you exactly what's happening when you refresh the question view.

### 3. **Quick Fix for Existing Messages** (if needed)

If the existing message doesn't have a `questionId`, you can either:

- Delete it from the database and submit a new one
- Or I can create a migration script to fix existing messages

## Added Features ✅

### Delete & Deactivate Buttons

- **Deactivate Button**: Orange button with eye-off icon - toggles question active/inactive
- **Delete Button**: Red button with trash icon - permanently deletes question and all responses
- Both buttons appear in the question detail view (right side of dashboard)

### Enhanced Refresh Functionality

- **Questions List Refresh**: Small refresh button in sidebar updates question counts
- **General Messages Refresh**: Refreshes general messages with success toast
- **Question Messages Refresh**: Refreshes specific question responses with success toast

## Next Steps

1. Test submitting a new response to the question
2. Check if the refresh button now shows the new response
3. Test the delete/deactivate buttons
4. Let me know what the debug logs show when you submit a new response!

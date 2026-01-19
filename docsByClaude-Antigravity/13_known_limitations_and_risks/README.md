# Known Limitations and Risks

> **Confidence:** CONFIRMED + INFERRED | Based on code analysis and CONTRACTS.md

---

## Known Limitations

### 1. No Token Refresh

**Issue:** JWT tokens are not automatically refreshed.

**Current Behavior:**
- Token expires after 30 minutes (backend default)
- On 401, user is redirected to login
- User must re-authenticate

**Impact:** Users in long sessions will be interrupted.

**Mitigation Options:**
- Implement refresh token flow
- Extend token expiry
- Show warning before expiry

---

### 2. No Offline Support

**Issue:** Application requires constant network connection.

**Current Behavior:**
- No service worker
- No caching of API responses
- WebSocket disconnects are handled but offline state is not

**Impact:** Users lose all functionality if network drops.

---

### 3. Session Storage Only

**Issue:** Auth state uses sessionStorage, not localStorage.

**Current Behavior:**
- Opening new browser window requires re-login
- Closing browser logs user out

**Impact:** May be unexpected for users used to persistent sessions.

**Note:** This is an intentional security decision, not a bug.

---

### 4. No Job Deletion UI

**Issue:** Delete endpoint exists but no UI to trigger it.

**Endpoints defined:**
```typescript
jobs: {
    delete: (id: string) => `/api/v1/jobs/${id}`,
}
```

**Current Behavior:** Users cannot delete jobs from the UI.

---

### 5. Hardcoded Domain Restriction

**Issue:** Allowed domains are hardcoded in config.

```typescript
auth: {
    allowedDomain: ['creativefuel.io'],
}
```

**Impact:** Adding new allowed domains requires code change and redeploy.

**Mitigation:** Move to environment variable or backend-controlled list.

---

### 6. Mock Data Fallback

**Issue:** Template selector falls back to mock data on error.

```typescript
} catch (err) {
    // Fallback mock data for development
    const mockPages: Page[] = [
        { id: '1', name: 'Modern Minimal', ... },
    ];
    setPages(mockPages);
}
```

**Risk:** If API fails in production, users see development mock data.

**Mitigation:** Remove fallback or use production-appropriate error handling.

---

### 7. No Rate Limiting UI

**Issue:** No visual feedback if user hits rate limits.

**Current Behavior:** Generic error message displayed.

**Impact:** Users don't know why requests are failing or when to retry.

---

## Potential Race Conditions

### 1. REST/WebSocket Race

**Scenario:** WebSocket event arrives before REST response.

**Current Handling:** Both update same store; last write wins.

**Risk Level:** Low — state converges quickly via polling.

### 2. Navigation During Fetch

**Scenario:** User navigates away while job is being fetched.

**Current Handling:** `mountedRef` prevents state updates after unmount.

```typescript
if (!mountedRef.current) return;
```

**Risk Level:** Low — handled correctly.

### 3. Rapid Job Navigation

**Scenario:** User clicks between jobs quickly.

**Current Handling:** `reset()` clears previous job state; new fetch begins.

**Risk Level:** Low — but may show flash of previous job.

---

## Security Considerations

### 1. Client-Side Domain Check

**Current:** Domain validation happens on frontend before API call.

```typescript
if (!isAllowedDomain(payload.email)) {
    setError('Only @xyz allowed');
    return;
}
```

**Risk:** Client-side checks can be bypassed.

**Mitigation:** Backend ALSO validates domain. Client-side is UX only.

### 2. JWT in Query Parameter

**Current:** WebSocket auth uses query parameter.

```typescript
const wsUrl = `...?token=${encodeURIComponent(token)}`;
```

**Risk:** Token may appear in server logs.

**Mitigation:** 
- Use short-lived tokens
- Backend should support header-based auth for WS
- Ensure logs are secured

### 3. Non-httpOnly Cookie

**Current:** JWT cookie is readable by JavaScript.

```typescript
Cookies.set(config.auth.tokenCookieName, token, {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    // httpOnly: NOT SET
});
```

**Risk:** XSS could steal tokens.

**Mitigation:**
- Strict CSP headers
- Input sanitization
- Consider httpOnly with server-side cookie setting

---

## Missing Features

| Feature | Status | Notes |
|---------|--------|-------|
| Toast notifications | ❌ Missing | Currently uses `alert()` |
| Job cancellation | ❌ Missing | No cancel button/endpoint |
| Job deletion | ❌ Missing | Endpoint exists, no UI |
| Clip download all | ❌ Missing | Individual downloads only |
| Search/filter jobs | ❌ Missing | Only pagination |
| User settings | ❌ Missing | No preferences page |
| Dark/light toggle | ❌ Missing | Dark mode only |
| Reduced motion | ❌ Missing | Animations always play |
| Error boundary | ❌ Missing | Crashes propagate up |
| Sentry/logging | ❌ Missing | Console.error only |

---

## Browser Compatibility

### Tested
- Chrome (latest)
- Firefox (latest)
- Safari (latest)

### Potential Issues
- **IE11:** Not supported (ES6+, CSS variables)
- **Old Safari:** WebSocket may have quirks
- **Mobile browsers:** Sidebar overlay behavior

---

## Performance Concerns

### 1. Large Job Lists

**Issue:** All jobs loaded into memory for pagination.

**Mitigation:** Use proper pagination with page limits.

### 2. Many Clips

**Issue:** ClipGallery renders all clips with `<video>` elements.

**Risk:** Memory usage for jobs with many clips.

**Mitigation:** Virtual scrolling for large clip counts.

### 3. WebSocket Memory

**Issue:** Events not garbage collected if component stays mounted.

**Current:** Events are processed immediately, not stored.

**Risk Level:** Low — no event history maintained.

---

## Recommendations for Future

1. **Implement token refresh** — Most impactful for user experience
2. **Add error boundary** — Prevent full app crashes
3. **Implement toast system** — Replace alerts with non-blocking notifications
4. **Add job deletion** — Complete CRUD operations
5. **Implement reduced motion** — Accessibility improvement
6. **Add loading states for clips** — Show skeleton while video loads
7. **Consider httpOnly cookies** — Enhanced security

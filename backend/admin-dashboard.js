function registerAdminDashboardRoutes(app, deps) {
  const { sql, auth, sendServerError } = deps;

  app.get('/api/admin/dashboard', auth.requireAdmin(), async (req, res) => {
    try {
      const base = await Promise.all([
        new sql.Request().query(`
          SELECT
            (SELECT COUNT_BIG(*) FROM dbo.Nodes) AS TotalNodes,
            (SELECT COUNT_BIG(*) FROM dbo.Nodes WHERE IsActive=1) AS ActiveNodes,
            (SELECT COUNT_BIG(*) FROM dbo.Nodes WHERE ISNULL(IsActive,0)=0) AS InactiveNodes,
            (SELECT COUNT_BIG(*) FROM dbo.Nodes WHERE ParentID IS NULL) AS RootNodes,
            (SELECT COUNT_BIG(*) FROM dbo.DanieliPDF) AS DanieliPDFs,
            (SELECT COUNT_BIG(*) FROM dbo.Users) AS TotalUsers,
            (SELECT COUNT_BIG(*) FROM dbo.Users WHERE IsActive=1) AS ActiveUsers,
            (SELECT COUNT_BIG(*) FROM dbo.Users WHERE ISNULL(IsActive,0)=0) AS InactiveUsers,
            (SELECT COUNT_BIG(*) FROM dbo.Roles WHERE IsActive=1) AS ActiveRoles,
            (SELECT COUNT_BIG(*) FROM dbo.Permissions WHERE IsActive=1) AS ActivePermissions,
            (SELECT COUNT_BIG(*) FROM dbo.Logs) AS TotalLogs,
            (SELECT COUNT_BIG(*) FROM dbo.Logs WHERE CreatedAt >= CONVERT(date,GETDATE())) AS TodayLogs,
            (SELECT COUNT_BIG(*) FROM dbo.Logs WHERE Action LIKE N'%FAILED%') AS FailedActions
        `),
        new sql.Request().query(`
          SELECT TOP 12 LogID, UserName, Action, IPAddress, CreatedAt
          FROM dbo.Logs
          ORDER BY CreatedAt DESC, LogID DESC
        `),
        new sql.Request().query(`
          SELECT CONVERT(date,CreatedAt) AS Day, COUNT_BIG(*) AS Count
          FROM dbo.Logs
          WHERE CreatedAt >= DATEADD(day,-6,CONVERT(date,GETDATE()))
          GROUP BY CONVERT(date,CreatedAt)
          ORDER BY Day ASC
        `)
      ]);

      const tableCheck = await new sql.Request().query(`
        SELECT name
        FROM sys.tables
        WHERE schema_id=SCHEMA_ID(N'dbo')
          AND name IN (N'DrawingRequests',N'DrawingRequestStatuses',N'Notifications')
      `);
      const tables = new Set(tableCheck.recordset.map(x => String(x.name)));

      let workflow = {
        available: false,
        total: 0,
        active: 0,
        completed: 0,
        rejected: 0,
        unreadNotifications: 0,
        statuses: []
      };

      if (tables.has('DrawingRequests') && tables.has('DrawingRequestStatuses')) {
        const workflowResult = await new sql.Request().query(`
          SELECT
            COUNT_BIG(*) AS TotalRequests,
            SUM(CASE WHEN s.StatusCode IN
              (N'FINAL_APPROVED',N'MANAGER_REJECTED',N'DRAWING_APPROVAL_REJECTED',N'FINAL_REJECTED',N'CANCELLED')
              THEN 0 ELSE 1 END) AS ActiveRequests,
            SUM(CASE WHEN s.StatusCode=N'FINAL_APPROVED' THEN 1 ELSE 0 END) AS CompletedRequests,
            SUM(CASE WHEN s.StatusCode IN
              (N'MANAGER_REJECTED',N'DRAWING_APPROVAL_REJECTED',N'FINAL_REJECTED')
              THEN 1 ELSE 0 END) AS RejectedRequests
          FROM dbo.DrawingRequests dr
          INNER JOIN dbo.DrawingRequestStatuses s ON s.StatusID=dr.StatusID;

          SELECT s.StatusCode, s.StatusName, COUNT_BIG(dr.RequestID) AS Count
          FROM dbo.DrawingRequestStatuses s
          LEFT JOIN dbo.DrawingRequests dr ON dr.StatusID=s.StatusID
          GROUP BY s.StatusID, s.StatusCode, s.StatusName
          ORDER BY s.StatusID;
        `);
        const summary = workflowResult.recordsets[0][0] || {};
        workflow = {
          available: true,
          total: Number(summary.TotalRequests || 0),
          active: Number(summary.ActiveRequests || 0),
          completed: Number(summary.CompletedRequests || 0),
          rejected: Number(summary.RejectedRequests || 0),
          unreadNotifications: 0,
          statuses: workflowResult.recordsets[1].map(x => ({
            code: x.StatusCode,
            name: x.StatusName,
            count: Number(x.Count || 0)
          }))
        };
      }

      if (tables.has('Notifications')) {
        const notificationResult = await new sql.Request().query(`
          SELECT COUNT_BIG(*) AS UnreadCount
          FROM dbo.Notifications
          WHERE IsRead=0
        `);
        workflow.unreadNotifications = Number(notificationResult.recordset[0]?.UnreadCount || 0);
      }

      res.json({
        generatedAt: new Date().toISOString(),
        overview: Object.fromEntries(
          Object.entries(base[0].recordset[0] || {}).map(([key, value]) => [key, Number(value || 0)])
        ),
        activity: base[2].recordset.map(x => ({
          day: x.Day,
          count: Number(x.Count || 0)
        })),
        recentLogs: base[1].recordset,
        workflow
      });
    } catch (e) {
      console.error('Admin dashboard load failed:', e);
      sendServerError(res, 'Admin dashboard load failed', e);
    }
  });
}

module.exports = { registerAdminDashboardRoutes };

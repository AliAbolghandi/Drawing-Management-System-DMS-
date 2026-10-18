const express = require('express');

function registerExpertReportRoutes(app, deps) {
  const { sql, auth, sendServerError } = deps;

  app.get('/api/expert-reports', auth.requirePermission('DASHBOAR_REPORT_EXPER'), async (req, res) => {
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate.trim() : '';
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate.trim() : '';

    const validDate = value => {
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
      const d = new Date(value + 'T00:00:00Z');
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
    };

    if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
      return res.status(400).json({ error: 'startDate and endDate must be valid YYYY-MM-DD dates, with startDate before endDate.' });
    }

    try {
      const db = new sql.Request();
      db.input('startDate', sql.Date, startDate);
      db.input('endDate', sql.Date, endDate);

      const result = await db.query(`
        WITH Work AS (
          SELECT
            ew.AssignmentID,
            ew.CroquisEndDate,
            ew.CroquisPartCount,
            ew.ModelingEndDate,
            ew.ModelingPartCount,
            ew.DrawingEndDate,
            ew.StandardPartCount,
            ew.DrawnPartCount,
            a.RequestID,
            a.DrawingExpertUserID,
            a.DrawingExpertUsername,
            u.Username,
            u.Name,
            u.Family
          FROM dbo.DrawingRequestExpertWork ew
          INNER JOIN dbo.DrawingRequestAssignments a ON a.AssignmentID=ew.AssignmentID
          LEFT JOIN dbo.Users u ON u.UserID=a.DrawingExpertUserID
        ),
        StageProduction AS (
          SELECT DrawingExpertUserID, DrawingExpertUsername, Username, Name, Family,
                 CroquisEndDate AS ProductionDate, N'Croquis' AS Stage,
                 CASE WHEN CroquisPartCount > 0 THEN CroquisPartCount ELSE 0 END AS PartCount
          FROM Work
          WHERE CroquisEndDate BETWEEN @startDate AND @endDate
          UNION ALL
          SELECT DrawingExpertUserID, DrawingExpertUsername, Username, Name, Family,
                 ModelingEndDate, N'Modeling',
                 CASE WHEN ModelingPartCount > 0 THEN ModelingPartCount ELSE 0 END
          FROM Work
          WHERE ModelingEndDate BETWEEN @startDate AND @endDate
          UNION ALL
          SELECT DrawingExpertUserID, DrawingExpertUsername, Username, Name, Family,
                 DrawingEndDate, N'Standard',
                 CASE WHEN StandardPartCount > 0 THEN StandardPartCount ELSE 0 END
          FROM Work
          WHERE DrawingEndDate BETWEEN @startDate AND @endDate
          UNION ALL
          SELECT DrawingExpertUserID, DrawingExpertUsername, Username, Name, Family,
                 DrawingEndDate, N'Drawn',
                 CASE WHEN DrawnPartCount > 0 THEN DrawnPartCount ELSE 0 END
          FROM Work
          WHERE DrawingEndDate BETWEEN @startDate AND @endDate
        )
        SELECT
          DrawingExpertUserID AS UserID,
          COALESCE(NULLIF(LTRIM(RTRIM(CONCAT(Name, N' ', Family))), N''), DrawingExpertUsername, Username, N'Unknown') AS ExpertName,
          COALESCE(DrawingExpertUsername, Username, N'') AS ExpertUsername,
          SUM(CASE WHEN Stage=N'Croquis' THEN PartCount ELSE 0 END) AS CroquisParts,
          SUM(CASE WHEN Stage=N'Modeling' THEN PartCount ELSE 0 END) AS ModelingParts,
          SUM(CASE WHEN Stage=N'Standard' THEN PartCount ELSE 0 END) AS StandardParts,
          SUM(CASE WHEN Stage=N'Drawn' THEN PartCount ELSE 0 END) AS DrawnParts,
          SUM(PartCount) AS TotalParts
        FROM StageProduction
        WHERE PartCount > 0
        GROUP BY DrawingExpertUserID, DrawingExpertUsername, Username, Name, Family;

        WITH Work AS (
          SELECT
            ew.AssignmentID,
            ew.CroquisEndDate,
            ew.CroquisPartCount,
            ew.ModelingEndDate,
            ew.ModelingPartCount,
            ew.DrawingEndDate,
            ew.StandardPartCount,
            ew.DrawnPartCount,
            a.DrawingExpertUserID,
            a.DrawingExpertUsername,
            u.Username,
            u.Name,
            u.Family
          FROM dbo.DrawingRequestExpertWork ew
          INNER JOIN dbo.DrawingRequestAssignments a ON a.AssignmentID=ew.AssignmentID
          LEFT JOIN dbo.Users u ON u.UserID=a.DrawingExpertUserID
        )
        SELECT
          ProductionDate,
          DrawingExpertUserID AS UserID,
          COALESCE(NULLIF(LTRIM(RTRIM(CONCAT(Name, N' ', Family))), N''), DrawingExpertUsername, Username, N'Unknown') AS ExpertName,
          SUM(PartCount) AS TotalParts
        FROM (
          SELECT CroquisEndDate AS ProductionDate, DrawingExpertUserID, DrawingExpertUsername, Username, Name, Family,
                 CASE WHEN CroquisPartCount > 0 THEN CroquisPartCount ELSE 0 END AS PartCount
          FROM Work WHERE CroquisEndDate BETWEEN @startDate AND @endDate
          UNION ALL
          SELECT ModelingEndDate, DrawingExpertUserID, DrawingExpertUsername, Username, Name, Family,
                 CASE WHEN ModelingPartCount > 0 THEN ModelingPartCount ELSE 0 END
          FROM Work WHERE ModelingEndDate BETWEEN @startDate AND @endDate
          UNION ALL
          SELECT DrawingEndDate, DrawingExpertUserID, DrawingExpertUsername, Username, Name, Family,
                 CASE WHEN StandardPartCount > 0 THEN StandardPartCount ELSE 0 END
          FROM Work WHERE DrawingEndDate BETWEEN @startDate AND @endDate
          UNION ALL
          SELECT DrawingEndDate, DrawingExpertUserID, DrawingExpertUsername, Username, Name, Family,
                 CASE WHEN DrawnPartCount > 0 THEN DrawnPartCount ELSE 0 END
          FROM Work WHERE DrawingEndDate BETWEEN @startDate AND @endDate
        ) stages
        WHERE PartCount > 0
        GROUP BY ProductionDate, DrawingExpertUserID, DrawingExpertUsername, Username, Name, Family
        ORDER BY ProductionDate, ExpertName;
      `);

      const [expertTotals, dailyProduction] = result.recordsets;
      res.json({
        startDate,
        endDate,
        experts: expertTotals || [],
        dailyProduction: dailyProduction || []
      });
    } catch (e) {
      console.error('Expert reports load failed:', e);
      sendServerError(res, 'Expert reports load failed', e);
    }
  });
}

module.exports = { registerExpertReportRoutes };

    (() => {
      const managementModal=document.getElementById('dmsManagementModal');
      const managementFrame=document.getElementById('dmsManagementFrame');
      const managementClose=document.getElementById('dmsManagementModalClose');
      const dashboardModal=document.getElementById('dmsDashboardModal');
      const dashboardFrame=document.getElementById('dmsDashboardFrame');
      const dashboardClose=document.getElementById('dmsDashboardModalClose');
      let previousOverflow='';
      function closeManagementModal(){
        if(!managementModal||managementModal.classList.contains('hidden'))return;
        managementModal.classList.add('hidden');
        document.body.style.overflow=previousOverflow;
        managementFrame.src='about:blank';
      }
      function closeDashboardModal(){
        if(!dashboardModal||dashboardModal.classList.contains('hidden'))return;
        dashboardModal.classList.add('hidden');
        document.body.style.overflow=previousOverflow;
        dashboardFrame.src='about:blank';
      }
      window.DMS=window.DMS||{};
      window.DMS.openManagementModal=()=>{
        if(!managementModal)return;
        closeDashboardModal();
        previousOverflow=document.body.style.overflow;
        managementFrame.src='management.html?dmsModal=1';
        managementModal.classList.remove('hidden');
        document.body.style.overflow='hidden';
        managementClose.focus();
      };
      window.DMS.openDashboardModal=()=>{
        if(!dashboardModal)return;
        closeManagementModal();
        previousOverflow=document.body.style.overflow;
        dashboardFrame.src='admin-dashboard.html?dmsModal=1';
        dashboardModal.classList.remove('hidden');
        document.body.style.overflow='hidden';
        dashboardClose.focus();
      };
      // Capture Dashboard clicks directly so opening the modal does not depend on
      // the earlier navigation handler or the current active-class state.
      document.addEventListener('click',event=>{
        const item=event.target instanceof Element?event.target.closest('[data-dms-nav="home"]'):null;
        if(!item)return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.DMS.openDashboardModal();
      },true);
      managementClose.addEventListener('click',closeManagementModal);
      dashboardClose.addEventListener('click',closeDashboardModal);
      managementModal.addEventListener('click',event=>{if(event.target===managementModal)closeManagementModal();});
      dashboardModal.addEventListener('click',event=>{if(event.target===dashboardModal)closeDashboardModal();});
      document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeManagementModal();closeDashboardModal();}});
      window.addEventListener('message',event=>{
        if(event.origin!==window.location.origin||!event.data)return;
        if(event.data.type==='dms-management-close')closeManagementModal();
        if(event.data.type==='dms-management-navigate'&&event.data.path==='admin-dashboard.html')window.DMS.openDashboardModal();
        if(event.data.type==='dms-dashboard-close')closeDashboardModal();
        if(event.data.type==='dms-dashboard-navigate'&&event.data.path==='management.html')window.DMS.openManagementModal();
      });
    })();
  

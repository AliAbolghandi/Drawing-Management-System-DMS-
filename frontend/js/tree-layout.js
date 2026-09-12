(function () {
    const GAP = 8;
    let scheduled = false;
    let busy = false;

    function visible(el) {
        return el && getComputedStyle(el).display !== 'none' && !el.classList.contains('collapsed');
    }

    function box(el) {
        return el.getBoundingClientRect();
    }

    function parts(node) {
        const result = [];
        const row = node.querySelector(':scope > .node-row');
        if (row) result.push(row);
        node.querySelectorAll(':scope > .tree-children, :scope > .tree-children .tree-children').forEach(el => {
            if (visible(el)) result.push(el);
        });
        return result;
    }

    function collision(a, b) {
        const ar = box(a), br = box(b);
        const x = Math.min(ar.right, br.right) - Math.max(ar.left, br.left);
        const y = Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top);
        if (x <= 0 || y <= 0) return null;
        return x < y ? { axis: 'x', amount: x + GAP } : { axis: 'y', amount: y + GAP };
    }

    function process(container) {
        if (!container) return;
        const nodes = Array.from(container.children).filter(el => el.classList.contains('tree-node'));
        for (let i = 1; i < nodes.length; i++) {
            const current = nodes[i];
            let x = 0;
            let y = 0;
            const currentParts = parts(current);
            for (let j = 0; j < i; j++) {
                const previousParts = parts(nodes[j]);
                currentParts.forEach(a => previousParts.forEach(b => {
                    const hit = collision(a, b);
                    if (!hit) return;
                    if (hit.axis === 'x') x = Math.max(x, hit.amount);
                    else y = Math.max(y, hit.amount);
                }));
            }
            if (x) current.style.marginLeft = `${x}px`;
            if (y) current.style.marginTop = `${y}px`;
        }
    }

    function reset() {
        document.querySelectorAll('.tree-node').forEach(node => {
            node.style.marginLeft = '';
            node.style.marginTop = '';
        });
    }

    function layout() {
        if (busy) return;
        busy = true;
        reset();
        requestAnimationFrame(() => {
            process(document.querySelector('.tree-container'));
            Array.from(document.querySelectorAll('.tree-children')).reverse().forEach(process);
            process(document.querySelector('.tree-container'));
            busy = false;
        });
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            layout();
        });
    }

    new MutationObserver(schedule).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });

    window.addEventListener('resize', schedule);
    window.addEventListener('load', schedule);
    schedule();
})();

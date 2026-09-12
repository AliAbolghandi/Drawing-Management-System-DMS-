(function () {
    const GAP = 8;
    let scheduled = false;
    let running = false;

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            layoutTreeCollisions();
        });
    }

    function visible(el) {
        return el && getComputedStyle(el).display !== 'none' && !el.classList.contains('collapsed');
    }

    function rect(el) {
        return el.getBoundingClientRect();
    }

    function overlapsHorizontally(a, b) {
        return a.left < b.right && a.right > b.left;
    }

    function expandedBranches(node) {
        return Array.from(node.querySelectorAll('.tree-children'))
            .filter(visible);
    }

    function processContainer(container) {
        const nodes = Array.from(container.children)
            .filter(el => el.classList.contains('tree-node'));

        if (nodes.length < 2) return;

        // Remove adjustments from the previous pass.
        nodes.forEach(node => { node.style.marginTop = ''; });

        for (let i = 1; i < nodes.length; i++) {
            const current = nodes[i];
            const currentRow = current.querySelector(':scope > .node-row');
            if (!currentRow) continue;

            let requiredShift = 0;
            const currentRect = rect(currentRow);
            const currentBranches = expandedBranches(current);

            // Compare the current row and its opened branches against every
            // previous sibling's opened branches. Space is added only when
            // there is an actual geometric collision.
            for (let j = 0; j < i; j++) {
                const previous = nodes[j];
                expandedBranches(previous).forEach(previousBranch => {
                    const previousRect = rect(previousBranch);

                    if (overlapsHorizontally(previousRect, currentRect) && previousRect.bottom > currentRect.top) {
                        requiredShift = Math.max(
                            requiredShift,
                            previousRect.bottom - currentRect.top + GAP
                        );
                    }

                    currentBranches.forEach(currentBranch => {
                        const currentBranchRect = rect(currentBranch);
                        if (overlapsHorizontally(previousRect, currentBranchRect) && previousRect.bottom > currentBranchRect.top) {
                            requiredShift = Math.max(
                                requiredShift,
                                previousRect.bottom - currentBranchRect.top + GAP
                            );
                        }
                    });
                });
            }

            if (requiredShift > 0) {
                current.style.marginTop = `${Math.ceil(requiredShift)}px`;
            }
        }
    }

    function layoutTreeCollisions() {
        if (running) return;
        running = true;

        try {
            // Bottom-up first so nested branches have their final geometry.
            const containers = Array.from(document.querySelectorAll('.tree-children')).reverse();
            containers.forEach(processContainer);

            // Second pass settles shifts caused by the first pass.
            containers.forEach(processContainer);
        } finally {
            running = false;
        }
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });

    window.addEventListener('resize', schedule);
    window.addEventListener('load', schedule);
    schedule();
})();

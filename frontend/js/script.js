// ======================================================
// Drawing Management System
// Tree Renderer
// ======================================================

const API_URL = 'http://localhost:3000/api/nodes';
const API_PDF_URL = 'http://localhost:3000/api/pdfs';
const API_PDF_OPEN_URL = 'http://localhost:3000/api/pdf-open';

let allNodes = [];
let nodeElements = new Map();

// NodeID -> array of PDF rows ({ PDFID, NodeID, NodeCode, PDFName })
let pdfsByNodeId = new Map();


// ======================================================
// DOM
// ======================================================

const treeContainer =
    document.getElementById('treeContainer');

const connectionStatus =
    document.getElementById('connectionStatus');

const nodeCount =
    document.getElementById('nodeCount');

const searchInput =
    document.getElementById('searchInput');

const expandAllBtn =
    document.getElementById('expandAllBtn');

const collapseAllBtn =
    document.getElementById('collapseAllBtn');


// ======================================================
// Load Data From SQL Server
// ======================================================

async function loadNodes() {

    try {

        treeContainer.innerHTML = `
            <div class="loading">
                در حال دریافت اطلاعات از SQL Server...
            </div>
        `;


        const response =
            await fetch(API_URL);


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }


        const data =
            await response.json();


        if (!Array.isArray(data)) {

            throw new Error(
                'پاسخ API آرایه نیست.'
            );

        }


        allNodes = data;


        console.log(
            'Nodes received:',
            allNodes.length
        );


        console.log(
            'First node:',
            allNodes[0]
        );


        // ------------------------------------------
        // Connection Status
        // ------------------------------------------

        connectionStatus.textContent =
            'اتصال برقرار است';

        connectionStatus.className =
            'status connected';


        nodeCount.textContent =
            `${allNodes.length.toLocaleString('fa-IR')} Node`;


        // ------------------------------------------
        // Render
        // ------------------------------------------

        renderTree(allNodes);


    } catch (error) {

        console.error(
            'Tree loading error:',
            error
        );


        connectionStatus.textContent =
            'خطا در اتصال';

        connectionStatus.className =
            'status disconnected';


        treeContainer.innerHTML = `
            <div class="error">
                <strong>
                    خطا در دریافت اطلاعات
                </strong>

                <br><br>

                ${escapeHtml(error.message)}
            </div>
        `;

    }

}


// ======================================================
// Load PDFs From SQL Server
// ======================================================

async function loadPdfs() {

    try {

        const response =
            await fetch(API_PDF_URL);


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }


        const data =
            await response.json();


        if (!Array.isArray(data)) {

            throw new Error(
                'پاسخ API PDF آرایه نیست.'
            );

        }


        // ------------------------------------------
        // Index PDFs By NodeID
        // ------------------------------------------

        pdfsByNodeId = new Map();


        data.forEach(pdf => {

            const nodeId =
                normalizeNodeId(
                    pdf.NodeID
                );


            if (nodeId === null) {

                return;

            }


            if (!pdfsByNodeId.has(nodeId)) {

                pdfsByNodeId.set(
                    nodeId,
                    []
                );

            }


            pdfsByNodeId
                .get(nodeId)
                .push(pdf);

        });


        console.log(
            'PDFs received:',
            data.length
        );


        // ------------------------------------------
        // Retroactively Highlight Already-Built Nodes
        // (nodes rendered before this fetch finished
        // didn't know yet whether they had PDFs)
        // ------------------------------------------

        nodeElements.forEach((entry, nodeId) => {

            if (pdfsByNodeId.has(nodeId)) {

                entry.row.classList.add(
                    'has-pdf'
                );

            }

        });


        // ------------------------------------------
        // Refresh Currently Selected Node (If Any)
        // ------------------------------------------

        const selectedRow =
            document.querySelector(
                '.node-row.selected'
            );


        if (selectedRow) {

            const selectedId =
                [...nodeElements.entries()]
                    .find(
                        ([, value]) =>
                            value.row === selectedRow
                    );


            if (selectedId) {

                renderPdfList(
                    selectedId[0]
                );

            }

        }


    } catch (error) {

        console.error(
            'PDF loading error:',
            error
        );

    }

}


// ======================================================
// Normalize ParentID
// ======================================================

function normalizeParentId(value) {

    // Root

    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {

        return null;

    }


    const number =
        Number(value);


    if (Number.isNaN(number)) {

        return null;

    }


    return number;

}


// ======================================================
// Normalize NodeID
// ======================================================

function normalizeNodeId(value) {

    const number =
        Number(value);


    if (Number.isNaN(number)) {

        return null;

    }


    return number;

}


// ======================================================
// Build Tree
// ======================================================

function buildTree(nodes) {

    const nodeMap =
        new Map();

    const roots = [];


    // ------------------------------------------
    // Create Node Objects
    // ------------------------------------------

    nodes.forEach(node => {

        const id =
            normalizeNodeId(node.NodeID);


        if (id === null) {

            return;

        }


        nodeMap.set(id, {

            ...node,

            _id: id,

            _parentId:
                normalizeParentId(
                    node.ParentID
                ),

            children: []

        });

    });


    // ------------------------------------------
    // Connect Nodes
    // ------------------------------------------

    nodeMap.forEach(node => {

        const parentId =
            node._parentId;


        // --------------------------------------
        // Root Node
        // --------------------------------------

        if (
            parentId === null ||
            !nodeMap.has(parentId)
        ) {

            roots.push(node);

            return;

        }


        // --------------------------------------
        // Child Node
        // --------------------------------------

        const parent =
            nodeMap.get(parentId);


        parent.children.push(node);

    });


    // ------------------------------------------
    // Sort Children By NodeID
    // ------------------------------------------

    function sortChildren(node) {

        node.children.sort(
            (a, b) =>
                a._id - b._id
        );


        node.children.forEach(
            child => sortChildren(child)
        );

    }


    roots.sort(
        (a, b) =>
            a._id - b._id
    );


    roots.forEach(
        root => sortChildren(root)
    );


    console.log(
        'Tree roots:',
        roots
    );


    return roots;

}


// ======================================================
// Render Tree
// ======================================================

function renderTree(nodes) {

    treeContainer.innerHTML = '';

    nodeElements.clear();


    const roots =
        buildTree(nodes);


    if (roots.length === 0) {

        treeContainer.innerHTML = `
            <div class="error">
                هیچ Root Nodeای پیدا نشد.
            </div>
        `;

        return;

    }


    // ------------------------------------------
    // Render Roots
    // ------------------------------------------

    roots.forEach(root => {

        const element =
            createNodeElement(
                root,
                true
            );


        treeContainer.appendChild(
            element
        );


        // Show the root's immediate children by
        // default (one level), without recursively
        // building the rest of the huge tree.

        const entry =
            nodeElements.get(
                root._id
            );


        if (entry && entry.hasChildren) {

            entry.setExpanded(true);

        }

    });

}


// ======================================================
// Create Node Element
// ======================================================

function createNodeElement(
    node,
    isRoot = false,
    forceExpand = false
) {

    const wrapper =
        document.createElement('div');


    wrapper.className =
        'tree-node';


    if (isRoot) {

        wrapper.classList.add('root');

    }


    // ==================================================
    // Row
    // ==================================================

    const row =
        document.createElement('div');


    row.className =
        'node-row';


    // ==================================================
    // Expand Button
    // ==================================================

    const expandButton =
        document.createElement('button');


    expandButton.className =
        'expand-btn';


    const hasChildren =
        node.children.length > 0;


    if (hasChildren) {

        // Starts collapsed by default (children
        // are not built yet, see setExpanded below).
        expandButton.textContent =
            '+';

    } else {

        expandButton.classList.add(
            'empty'
        );

    }


    // ==================================================
    // Icon
    // ==================================================

    const icon =
        document.createElement('div');


    icon.className =
        'node-icon';


    icon.textContent =
        hasChildren
            ? '▰'
            : '▪';


    // ==================================================
    // Content (Code + Name combined into one label,
    // e.g. "GP0BV001  -Melt Shop")
    // ==================================================

    const content =
        document.createElement('div');


    content.className =
        'node-content';


    const label =
        document.createElement('div');


    label.className =
        'node-label';


    const codePart =
        node.NodeCode ||
        '';

    const namePart =
        node.NodeName ||
        '(بدون نام)';


    label.textContent =
        `${codePart}  -${namePart}`;


    content.appendChild(
        label
    );


    // ==================================================
    // Assemble Row
    // ==================================================

    row.appendChild(
        expandButton
    );

    row.appendChild(
        icon
    );

    row.appendChild(
        content
    );


    wrapper.appendChild(
        row
    );


    // ==================================================
    // Children (built lazily on first expand)
    // ==================================================

    let childrenContainer = null;

    let isExpanded = false;


    function buildChildrenIfNeeded() {

        if (childrenContainer) {

            return;

        }


        childrenContainer =
            document.createElement('div');


        childrenContainer.className =
            'tree-children';


        node.children.forEach(child => {

            const childElement =
                createNodeElement(
                    child,
                    false,
                    forceExpand
                );


            childrenContainer.appendChild(
                childElement
            );

        });


        wrapper.appendChild(
            childrenContainer
        );

    }


    function setExpanded(expand) {

        if (!hasChildren) {

            return;

        }


        if (expand) {

            buildChildrenIfNeeded();

            childrenContainer.classList.remove(
                'collapsed'
            );

            expandButton.textContent =
                '−';

        } else {

            if (childrenContainer) {

                childrenContainer.classList.add(
                    'collapsed'
                );

            }

            expandButton.textContent =
                '+';

        }


        isExpanded = expand;

    }


    if (hasChildren) {

        expandButton.addEventListener(
            'click',
            event => {

                event.stopPropagation();

                setExpanded(!isExpanded);

            }
        );

    }


    // ==================================================
    // Node Click
    // ==================================================

    row.addEventListener(
        'click',
        () => {

            selectNode(
                node,
                row
            );

        }
    );


    // ==================================================
    // Highlight If This Node Has PDFs Attached
    // (pdfsByNodeId may already be populated by the
    // time this node is built; if not, loadPdfs()
    // re-applies this to already-built nodes too.)
    // ==================================================

    if (pdfsByNodeId.has(node._id)) {

        row.classList.add(
            'has-pdf'
        );

    }


    // ==================================================
    // Store Element
    // ==================================================

    nodeElements.set(
        node._id,
        {
            node,
            wrapper,
            row,
            hasChildren,
            setExpanded
        }
    );


    // Search results (forceExpand = true) should be
    // shown fully open right away since that subset
    // is small.
    if (forceExpand && hasChildren) {

        setExpanded(true);

    }


    return wrapper;

}


// ======================================================
// Select Node
// ======================================================

function selectNode(
    node,
    row
) {

    document
        .querySelectorAll(
            '.node-row.selected'
        )
        .forEach(element => {

            element.classList.remove(
                'selected'
            );

        });


    row.classList.add(
        'selected'
    );


    showNodeDetails(
        node
    );

}


// ======================================================
// Node Details
// ======================================================

function showNodeDetails(node) {

    const emptyDetails =
        document.getElementById(
            'emptyDetails'
        );


    const nodeDetails =
        document.getElementById(
            'nodeDetails'
        );


    emptyDetails.classList.add(
        'hidden'
    );


    nodeDetails.classList.remove(
        'hidden'
    );


    document.getElementById(
        'detailName'
    ).textContent =
        node.NodeName || '-';


    document.getElementById(
        'detailId'
    ).textContent =
        node.NodeID ?? '-';


    document.getElementById(
        'detailParent'
    ).textContent =
        node.ParentID ?? 'Root';


    document.getElementById(
        'detailCode'
    ).textContent =
        node.NodeCode || '-';


    document.getElementById(
        'detailNodeName'
    ).textContent =
        node.NodeName || '-';


    const status =
        document.getElementById(
            'detailStatus'
        );


    if (
        node.IsActive === true ||
        Number(node.IsActive) === 1
    ) {

        status.textContent =
            'Active';

        status.className =
            'node-status';

    } else {

        status.textContent =
            'Inactive';

        status.className =
            'node-status inactive';

    }


    // ------------------------------------------
    // PDFs
    // ------------------------------------------

    renderPdfList(
        node._id ??
            normalizeNodeId(node.NodeID)
    );

}


// ======================================================
// Render PDF List For A Node
// ======================================================

function renderPdfList(nodeId) {

    const pdfList =
        document.getElementById(
            'pdfList'
        );


    if (!pdfList) {

        return;

    }


    const pdfs =
        pdfsByNodeId.get(nodeId) ||
        [];


    if (pdfs.length === 0) {

        pdfList.innerHTML = `
            <div class="pdf-empty">
                فایل PDF ثبت نشده است.
            </div>
        `;

        return;

    }


    pdfList.innerHTML =
        pdfs
            .map(pdf => `
                <div
                    class="pdf-item"
                    data-pdf-id="${pdf.PDFID}"
                    title="باز کردن با برنامه پیش‌فرض سیستم"
                >
                    <span class="pdf-icon">
                        📄
                    </span>
                    <span class="pdf-name">
                        ${escapeHtml(
                            pdf.PDFName ||
                                '(بدون نام)'
                        )}
                    </span>
                </div>
            `)
            .join('');


    // ------------------------------------------
    // Click => Open With OS Default Application
    // ------------------------------------------

    pdfList
        .querySelectorAll('.pdf-item')
        .forEach(item => {

            item.addEventListener(
                'click',
                () => {

                    openPdfInDefaultApp(
                        item.dataset.pdfId
                    );

                }
            );

        });

}


// ======================================================
// Open A PDF With The OS Default Application
// ======================================================

async function openPdfInDefaultApp(pdfId) {

    try {

        const response =
            await fetch(
                `${API_PDF_OPEN_URL}/${encodeURIComponent(pdfId)}`
            );

        const data =
            await response.json();


        if (!response.ok || !data.success) {

            console.error(
                'PDF open error:',
                data
            );

            alert(
                'خطا در باز کردن فایل PDF:\n' +
                (data.error || 'خطای نامشخص')
            );

        }

    } catch (error) {

        console.error(
            'PDF open request failed:',
            error
        );

        alert(
            'اتصال به سرور برای باز کردن PDF برقرار نشد.'
        );

    }

}


// ======================================================
// Expand All
// ======================================================

function expandAll() {

    // Note: nodeElements grows while iterating, since
    // setExpanded() lazily builds children on the fly.
    // Map.forEach visits entries added during iteration,
    // so this correctly cascades through the whole tree.
    // For a very large tree this can take a moment.

    nodeElements.forEach(entry => {

        if (entry.hasChildren) {

            entry.setExpanded(true);

        }

    });

}


// ======================================================
// Collapse All
// ======================================================

function collapseAll() {

    nodeElements.forEach(entry => {

        if (entry.hasChildren) {

            entry.setExpanded(false);

        }

    });

}


// ======================================================
// Search
// ======================================================

searchInput.addEventListener(
    'input',
    () => {

        const query =
            searchInput.value
                .trim()
                .toLowerCase();


        if (!query) {

            renderTree(
                allNodes
            );

            return;

        }


        const matchingIds =
            new Set();


        // ------------------------------------------
        // Find Matches
        // ------------------------------------------

        allNodes.forEach(node => {

            const code =
                String(
                    node.NodeCode || ''
                ).toLowerCase();


            const name =
                String(
                    node.NodeName || ''
                ).toLowerCase();


            if (
                code.includes(query) ||
                name.includes(query)
            ) {

                matchingIds.add(
                    Number(node.NodeID)
                );

            }

        });


        // ------------------------------------------
        // Add Parents
        // ------------------------------------------

        let changed = true;


        while (changed) {

            changed = false;


            allNodes.forEach(node => {

                const id =
                    Number(node.NodeID);


                const parentId =
                    normalizeParentId(
                        node.ParentID
                    );


                if (
                    matchingIds.has(id) &&
                    parentId !== null &&
                    !matchingIds.has(parentId)
                ) {

                    matchingIds.add(
                        parentId
                    );

                    changed = true;

                }

            });

        }


        const filtered =
            allNodes.filter(node =>
                matchingIds.has(
                    Number(node.NodeID)
                )
            );


        renderTree(
            filtered
        );


        expandAll();

    }
);


// ======================================================
// Buttons
// ======================================================

expandAllBtn.addEventListener(
    'click',
    expandAll
);


collapseAllBtn.addEventListener(
    'click',
    collapseAll
);


// ======================================================
// Escape HTML
// ======================================================

function escapeHtml(value) {

    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

}


// ======================================================
// Start Application
// ======================================================

loadNodes();
loadPdfs();
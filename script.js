document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const toggleViewBtn = document.getElementById('toggleViewBtn');
    const searchPromptsInput = document.getElementById('searchPrompts');
    const copyConfirmationPopup = document.getElementById('copy-confirmation');

    const loadFolderBtn = document.getElementById('loadFolderBtn');
    const loadFromGoogleDriveBtn = document.getElementById('loadFromGoogleDriveBtn');


    let parsedData = null;
    let currentPrompts = [];
    let fileHandles = [];
    let isCompleteView = true;
    let fileTags = {};
    let allTags = [];

    const fileCache = new Map();

    loadTags();

    marked.setOptions({
        highlight: function(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            try {
                return hljs.highlight(code, { language, ignoreIllegals: true }).value;
            } catch (e) {
                return hljs.highlight(code, { language: 'plaintext', ignoreIllegals: true }).value;
            }
        },
        pedantic: false,
        gfm: true,
        breaks: false,
        sanitize: false,
        smartLists: true,
        smartypants: false,
        xhtml: false
    });

    const firstTabButton = document.querySelector('#details-tabs .tab-link');
    if (firstTabButton) {
        openTab(null, firstTabButton.dataset.tab, firstTabButton);

        document.querySelectorAll('.toggle-visibility-btn').forEach(btn => {
            const targetId = btn.dataset.target;
            const contentElement = document.getElementById(targetId);
            if (contentElement) {
                const isInitiallyHiddenByClass = contentElement.classList.contains('initially-hidden');
                const isHiddenByStyle = contentElement.style.display === 'none';

                if (isInitiallyHiddenByClass) {
                    contentElement.style.display = 'none';
                    btn.textContent = '[Show]';
                } else if (isHiddenByStyle) {
                     btn.textContent = '[Show]';
                }
                else {
                    btn.textContent = '[Hide]';
                }
            }
        });
    }

    fileInput.addEventListener('change', (e) => handleFileLoad(e.target.files[0]));
    loadFolderBtn.addEventListener('click', handleFolderLoad);
    loadFromGoogleDriveBtn.addEventListener('click', handleGoogleDriveLoad);
    
    toggleViewBtn.addEventListener('click', () => {
        if (parsedData) {
            isCompleteView = !isCompleteView;
            if (isCompleteView) {
                displayCompleteDialog();
                toggleViewBtn.textContent = 'View Single Prompts';
            } else {
                displaySinglePrompts();
                toggleViewBtn.textContent = 'View Complete Dialog';
            }
        } else {
            alert("Please load a file first.");
        }
    });

    searchPromptsInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        const promptItems = document.querySelectorAll('#prompt-list .prompt-item');
        promptItems.forEach(item => {
            const itemText = item.getAttribute('data-full-text') ? item.getAttribute('data-full-text').toLowerCase() : item.textContent.toLowerCase();
            if (itemText.includes(searchTerm)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    });

    document.querySelectorAll('#details-tabs .tab-link').forEach(button => {
        button.addEventListener('click', (event) => {
            openTab(event, button.dataset.tab, button);
        });
    });

    document.getElementById('details-section').addEventListener('click', function(event) {
        if (event.target.classList.contains('toggle-visibility-btn')) {
            const targetId = event.target.dataset.target;
            const contentElement = document.getElementById(targetId);
            if (contentElement) {
                const isHidden = contentElement.style.display === 'none' || contentElement.classList.contains('initially-hidden');
                contentElement.style.display = isHidden ? 'block' : 'none';
                contentElement.classList.remove('initially-hidden');
                event.target.textContent = isHidden ? '[Hide]' : '[Show]';
            }
        }
    });

    document.getElementById('answer-view').addEventListener('click', function(event) {
        if (event.target.classList.contains('copy-code-btn')) {
            const preElement = event.target.closest('pre');
            if (preElement) {
                const codeElement = preElement.querySelector('code');
                const codeToCopy = codeElement ? codeElement.innerText : preElement.innerText;
                navigator.clipboard.writeText(codeToCopy).then(() => {
                    showCopyConfirmation();
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                    alert('Failed to copy code.');
                });
            }
        }
        const collapsibleHeader = event.target.closest('.collapsible-header');
        if (collapsibleHeader) {
            const messageDiv = collapsibleHeader.closest('.message');
            if (messageDiv) {
                toggleCollapsibleMessage(messageDiv);
            }
        }
    });

    function handleFileLoad(file) {
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    parsedData = JSON.parse(e.target.result);
                    processLlmOutput();
                    renderTagManager(file.name);
                } catch (error) {
                    console.error("Error parsing JSON:", error);
                    document.getElementById('answer-view').innerHTML = `<p class="placeholder error">Error parsing file. Please ensure it's valid JSON.</p>`;
                    alert("Invalid JSON file. Check console for details.");
                }
            };
            reader.readAsText(file);
        }
    }

    async function handleFolderLoad() {
        try {
            const dirHandle = await window.showDirectoryPicker();
            fileHandles = [];
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file' && !entry.name.endsWith('.png') && !entry.name.endsWith('.pdf') && !entry.name.endsWith('.webp') && !entry.name.endsWith('.js') && !entry.name.endsWith('.zip')) {
                    const file = await entry.getFile();
                    fileHandles.push({
                        name: file.name,
                        handle: entry,
                        modifiedTime: file.lastModified,
                        getFile: () => file
                    });
                }
            }
            sortFiles();
            populateFileList();
            renderTags();
        } catch (err) {
            console.error("Error reading folder:", err);
        }
    }

    function populateFileList() {
        const fileListEl = document.getElementById('file-list');
        fileListEl.innerHTML = '';
        if (fileHandles.length === 0) {
            fileListEl.innerHTML = '<p class="placeholder">No JSON files found.</p>';
            return;
        }
        fileHandles.forEach((handle, index) => {
            const listItem = document.createElement('div');
            listItem.classList.add('file-item');
            listItem.title = handle.name;
            listItem.dataset.index = index;

            const tagsContainer = document.createElement('div');
            tagsContainer.classList.add('file-item-tags');
            const tags = fileTags[handle.name] || [];
            tags.forEach(tag => {
                const tagEl = document.createElement('span');
                tagEl.classList.add('file-item-tag');
                tagEl.textContent = tag;
                tagEl.style.backgroundColor = getTagColor(tag);
                tagsContainer.appendChild(tagEl);
            });

            const fileNameEl = document.createElement('span');
            fileNameEl.textContent = handle.name;

            listItem.appendChild(tagsContainer);
            listItem.appendChild(fileNameEl);

            listItem.onclick = async () => {
                if (handle.isGoogleDrive) {
                    await loadGoogleDriveFileContent(handle);
                } else {
                    const file = await handle.getFile();
                    handleFileLoad(file);
                }
                document.querySelectorAll('#file-list .file-item').forEach(item => item.classList.remove('active'));
                listItem.classList.add('active');
            };
            fileListEl.appendChild(listItem);
        });
    }

    const sortAlphaBtn = document.getElementById('sort-alpha-btn');
    const sortDateBtn = document.getElementById('sort-date-btn');

    sortAlphaBtn.addEventListener('click', () => {
        sortFiles('alphabetical');
        sortAlphaBtn.classList.add('active');
        sortDateBtn.classList.remove('active');
        populateFileList();
    });

    sortDateBtn.addEventListener('click', () => {
        sortFiles('modifiedDate');
        sortDateBtn.classList.add('active');
        sortAlphaBtn.classList.remove('active');
        populateFileList();
    });

    function sortFiles(sortBy = 'alphabetical') {
        if (sortBy === 'alphabetical') {
            fileHandles.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortBy === 'modifiedDate') {
            fileHandles.sort((a, b) => b.modifiedTime - a.modifiedTime);
        }
    }

    function processLlmOutput() {
        if (!parsedData) return;

        displayRunDetails(parsedData.runSettings);
        displayCitations(parsedData.citations);
        displaySystemInstruction(parsedData.systemInstruction);

        currentPrompts = [];
        const chunks = parsedData.chunkedPrompt?.chunks || [];
        for (let i = 0; i < chunks.length; i++) {
            if (chunks[i].role === 'user') {
                currentPrompts.push({
                    role: 'user',
                    text: chunks[i].text,
                    tokenCount: chunks[i].tokenCount,
                    originalIndexInChunks: i
                });
            }
        }
        populatePromptList();
        displayCompleteDialog();
        isCompleteView = true;
        toggleViewBtn.textContent = 'View Single Prompts';
    }

    function displaySinglePrompts() {
        if (currentPrompts.length > 0) {
            displayPromptAndAnswer(0);
        } else {
            document.getElementById('prompt-list').innerHTML = '<p class="placeholder">No user prompts found in the file.</p>';
            document.getElementById('answer-view').innerHTML = '<p class="placeholder">No user prompts found to display.</p>';
        }
    }

    function populatePromptList() {
        const promptListEl = document.getElementById('prompt-list');
        promptListEl.innerHTML = '';
        if (currentPrompts.length === 0) {
            promptListEl.innerHTML = '<p class="placeholder">No prompts to display.</p>';
            return;
        }
        currentPrompts.forEach((prompt, index) => {
            const listItem = document.createElement('div');
            listItem.classList.add('prompt-item');
            listItem.textContent = truncateText(prompt.text, 60);
            listItem.title = prompt.text?.substring(0, 200) + (prompt.text?.length > 200 ? '...' : '');
            listItem.setAttribute('data-full-text', prompt.text);
            listItem.dataset.index = index;
            listItem.onclick = () => {
                if (isCompleteView) {
                    const messageToScrollTo = document.querySelector(`[data-chunk-index="${prompt.originalIndexInChunks}"]`);
                    if (messageToScrollTo) {
                        messageToScrollTo.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        document.querySelectorAll('#prompt-list .prompt-item').forEach(item => item.classList.remove('active'));
                        listItem.classList.add('active');
                    }
                } else {
                    displayPromptAndAnswer(index);
                }
            };
            promptListEl.appendChild(listItem);
        });
    }

    function createMessageDiv(chunk, chunkIndex, isInitiallyCollapsed = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        messageDiv.dataset.chunkIndex = chunkIndex;
        
        let headerText = 'Unknown Role';
        if (chunk.role === 'user') {
            messageDiv.classList.add('user-message');
            headerText = 'User Prompt';
        } else if (chunk.role === 'model') {
            messageDiv.classList.add('model-message');
            if (chunk.isThought) {
                messageDiv.classList.add('thought-message');
                headerText = 'Model (Thought Process)';
            } else {
                headerText = 'Model Response';
            }
        }
        
        const headerDiv = document.createElement('div');
        headerDiv.classList.add('collapsible-header');
        
        const h3 = document.createElement('h3');
        h3.textContent = headerText;
        headerDiv.appendChild(h3);

        const toggleBtn = document.createElement('button');
        toggleBtn.classList.add('toggle-button');
        toggleBtn.textContent = isInitiallyCollapsed ? '[+]' : '[-]';
        headerDiv.appendChild(toggleBtn);
        
        messageDiv.appendChild(headerDiv);

        const metadataDiv = document.createElement('div');
        metadataDiv.classList.add('metadata');
        metadataDiv.textContent = `Tokens: ${chunk.tokenCount || 'N/A'}`;
        messageDiv.appendChild(metadataDiv);

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('content');
        const rawHtml = marked.parse(chunk.text || '');
        contentDiv.innerHTML = DOMPurify.sanitize(rawHtml);
        messageDiv.appendChild(contentDiv);

        contentDiv.querySelectorAll('pre').forEach(pre => {
            addCopyButtonToPre(pre);
            let codeTag = pre.querySelector('code');
            if (!codeTag) {
                const preContent = pre.innerHTML;
                pre.innerHTML = '';
                codeTag = document.createElement('code');
                codeTag.innerHTML = preContent;
                pre.appendChild(codeTag);
            }
            hljs.highlightElement(codeTag);
        });
        
        if (isInitiallyCollapsed) {
            messageDiv.classList.add('collapsed');
        }

        return messageDiv;
    }

    function toggleCollapsibleMessage(messageDiv) {
        messageDiv.classList.toggle('collapsed');
        const toggleBtn = messageDiv.querySelector('.collapsible-header .toggle-button');
        if (toggleBtn) {
            toggleBtn.textContent = messageDiv.classList.contains('collapsed') ? '[+]' : '[-]';
        }
    }

    function displayPromptAndAnswer(promptIndex) {
        if (!parsedData || promptIndex >= currentPrompts.length) return;

        document.querySelectorAll('#prompt-list .prompt-item').forEach((item, idx) => {
            item.classList.toggle('active', idx === parseInt(item.dataset.index) && idx === promptIndex);
        });
        document.getElementById('toggleViewBtn').classList.remove('active');

        const answerViewEl = document.getElementById('answer-view');
        answerViewEl.innerHTML = '';

        const selectedUserPrompt = currentPrompts[promptIndex];
        const originalChunkIndex = selectedUserPrompt.originalIndexInChunks;

        const promptDiv = createMessageDiv(selectedUserPrompt, originalChunkIndex, false);
        answerViewEl.appendChild(promptDiv);
        
        const allChunks = parsedData.chunkedPrompt.chunks;
        let modelResponseFound = false;
        for (let i = originalChunkIndex + 1; i < allChunks.length; i++) {
            const chunk = allChunks[i];
            if (chunk.role === 'model') {
                modelResponseFound = true;
                const isThought = chunk.isThought || false;
                const modelDiv = createMessageDiv(chunk, i, isThought);
                answerViewEl.appendChild(modelDiv);
            } else if (chunk.role === 'user') {
                break;
            }
        }
        if (!modelResponseFound) {
            const noResponseDiv = document.createElement('p');
            noResponseDiv.classList.add('placeholder');
            noResponseDiv.textContent = 'No model response followed this prompt directly.';
            answerViewEl.appendChild(noResponseDiv);
        }
    }

    function displayCompleteDialog() {
        if (!parsedData || !parsedData.chunkedPrompt?.chunks) {
            document.getElementById('answer-view').innerHTML = '<p class="placeholder">No data loaded for complete dialog.</p>';
            return;
        }
        document.querySelectorAll('#prompt-list .prompt-item.active').forEach(item => item.classList.remove('active'));
        document.getElementById('toggleViewBtn').classList.add('active');

        const answerViewEl = document.getElementById('answer-view');
        answerViewEl.innerHTML = '<h2>Complete Dialog</h2>';

        parsedData.chunkedPrompt.chunks.forEach((chunk, index) => {
            const isUserPrompt = chunk.role === 'user';
            const isThought = chunk.role === 'model' && (chunk.isThought || false);
            const messageDiv = createMessageDiv(chunk, index, isThought); 
            answerViewEl.appendChild(messageDiv);
        });
    }

    function addCopyButtonToPre(preElement) {
        if (preElement.querySelector('.copy-code-btn')) return;
        const copyButton = document.createElement('button');
        copyButton.classList.add('copy-code-btn');
        copyButton.textContent = 'Copy';
        preElement.style.position = 'relative';
        preElement.appendChild(copyButton);
    }

    function showCopyConfirmation() {
        copyConfirmationPopup.classList.add('show');
        setTimeout(() => {
            copyConfirmationPopup.classList.remove('show');
        }, 2000);
    }

    function displayRunDetails(settings) {
        const el = document.getElementById('run-details-content');
        el.innerHTML = '';
        if (!settings || Object.keys(settings).length === 0) {
            el.innerHTML = '<p class="placeholder">No run settings available.</p>';
            return;
        }
        let content = '<ul>';
        for (const key in settings) {
            let value = settings[key];
            if (typeof value === 'object') {
                value = `<pre><code class="language-json">${DOMPurify.sanitize(JSON.stringify(value, null, 2))}</code></pre>`;
            } else {
                value = DOMPurify.sanitize(value.toString());
            }
            content += `<li><strong>${DOMPurify.sanitize(key)}:</strong> ${value}</li>`;
        }
        content += '</ul>';
        el.innerHTML = content;
        el.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
    }

    function displayCitations(citations) {
        const el = document.getElementById('citations-content');
        el.innerHTML = '';
        if (!citations || citations.length === 0) {
            el.innerHTML = '<p class="placeholder">No citations provided.</p>';
            return;
        }
        let content = '<ul>';
        citations.forEach(citation => {
            const uri = DOMPurify.sanitize(citation.uri || '');
            content += `<li>URI: <a href="${uri}" target="_blank" rel="noopener noreferrer">${uri}</a></li>`;
        });
        content += '</ul>';
        el.innerHTML = content;
    }

    function displaySystemInstruction(instruction) {
        const el = document.getElementById('system-instruction-content');
        el.innerHTML = '';
        let contentToDisplay = '<p class="placeholder">No system instruction provided.</p>';
        if (instruction) {
            let textToParse = JSON.stringify(instruction, null, 2);
            contentToDisplay = `<pre><code class="language-json">${textToParse}</code></pre>`;
        }
        el.innerHTML = contentToDisplay;
        el.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
    }

    function truncateText(text, maxLength) {
        if (!text) return "Untitled Prompt";
        const firstLine = text.split('\n')[0];
        if (firstLine.length <= maxLength) return firstLine;
        return firstLine.substring(0, maxLength).trim() + '...';
    }

    function openTab(evt, tabId, clickedButton) {
        const tabcontent = document.querySelectorAll("#details-section .tab-content");
        tabcontent.forEach(tab => {
            tab.style.display = "none";
            tab.classList.remove("active");
        });

        const tablinks = document.querySelectorAll("#details-tabs .tab-link");
        tablinks.forEach(link => {
            link.classList.remove("active");
        });

        const currentTab = document.getElementById(tabId);
        if (currentTab) {
            currentTab.style.display = "block";
            currentTab.classList.add("active");
        }
        if (clickedButton) {
            clickedButton.classList.add("active");
        }
    }

    function loadTags() {
        const storedFileTags = localStorage.getItem('fileTags');
        const storedAllTags = localStorage.getItem('allTags');
        if (storedFileTags) {
            fileTags = JSON.parse(storedFileTags);
        }
        if (storedAllTags) {
            allTags = JSON.parse(storedAllTags);
        }
        renderTags();
    }

    function saveTags() {
        localStorage.setItem('fileTags', JSON.stringify(fileTags));
        localStorage.setItem('allTags', JSON.stringify(allTags));
    }

    function renderTagManager(fileName) {
        const tagManagerContainer = document.getElementById('file-tags-manager');
        const tags = fileTags[fileName] || [];

        let tagsHtml = tags.map(tag => `
            <div class="tag-badge">
                ${tag}
                <button class="remove-tag-btn" data-tag="${tag}" data-file="${fileName}">&times;</button>
            </div>
        `).join('');

        tagManagerContainer.innerHTML = `
            <div class="tag-manager-container">
                <h3>Tags for ${fileName}</h3>
                <div class="current-tags">${tagsHtml}</div>
                <div class="add-tag-form">
                    <input type="text" id="new-tag-for-file" placeholder="Add a new tag...">
                    <button id="add-tag-to-file-btn">Add Tag</button>
                </div>
            </div>
        `;

        document.getElementById('add-tag-to-file-btn').addEventListener('click', () => {
            const newTagInput = document.getElementById('new-tag-for-file');
            const newTag = newTagInput.value.trim();
            if (newTag) {
                if (!fileTags[fileName]) {
                    fileTags[fileName] = [];
                }
                if (!fileTags[fileName].includes(newTag)) {
                    fileTags[fileName].push(newTag);
                    fileTags[fileName].sort();
                    if (!allTags.includes(newTag)) {
                        allTags.push(newTag);
                        allTags.sort();
                    }
                    saveTags();
                    renderTagManager(fileName);
                    renderTags();
                    populateFileList();
                }
                newTagInput.value = '';
            }
        });

        tagManagerContainer.querySelectorAll('.remove-tag-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const tagToRemove = e.target.dataset.tag;
                const file = e.target.dataset.file;

                const checkbox = document.querySelector(`#tags-list input[data-tag="${tagToRemove}"]`);
                if (checkbox) {
                    checkbox.checked = false;
                }

                fileTags[file] = fileTags[file].filter(t => t !== tagToRemove);
                saveTags();
                renderTagManager(file);
                filterFiles();
                renderTags();
                populateFileList();
            });
        });
    }

    function renderTags() {
        const tagsListEl = document.getElementById('tags-list');
        tagsListEl.innerHTML = '';

        const loadedFiles = fileHandles.map(handle => handle.name);
        const usedTags = new Set();
        loadedFiles.forEach(fileName => {
            if (fileTags[fileName]) {
                fileTags[fileName].forEach(tag => usedTags.add(tag));
            }
        });

        const sortedTags = Array.from(usedTags).sort();

        if (sortedTags.length === 0) {
            return;
        }

        sortedTags.forEach(tag => {
            const tagEl = document.createElement('div');
            tagEl.classList.add('tag-item');
            tagEl.innerHTML = `
                <input type="checkbox" data-tag="${tag}">
                <span>${tag}</span>
            `;
            tagsListEl.appendChild(tagEl);
        });
    }

    document.getElementById('tags-list').addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            filterFiles();
        }
    });

    function filterFiles() {
        const selectedTags = Array.from(document.querySelectorAll('#tags-list input[type="checkbox"]:checked')).map(cb => cb.dataset.tag);
        const fileItems = document.querySelectorAll('#file-list .file-item');

        fileItems.forEach(item => {
            const fileName = item.title;
            const tagsForFile = fileTags[fileName] || [];
            const hasAllTags = selectedTags.every(tag => tagsForFile.includes(tag));

            if (selectedTags.length === 0 || hasAllTags) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }

    function getTagColor(tag) {
        let hash = 0;
        for (let i = 0; i < tag.length; i++) {
            hash = tag.charCodeAt(i) + ((hash << 5) - hash);
        }
        let color = '#';
        for (let i = 0; i < 3; i++) {
            let value = (hash >> (i * 8)) & 0xFF;
            color += ('00' + value.toString(16)).substr(-2);
        }
        return color;
    }

    // Google Drive Integration
    let tokenClient;
    let accessToken;
    let gapiInited = false;
    let gisInited = false;

    const CLIENT_ID = 'YOUR_CLIENT_ID';
    const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
    const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

    function handleGoogleDriveLoad() {
        if (!CLIENT_ID || CLIENT_ID === 'YOUR_CLIENT_ID') {
            alert('Please replace "YOUR_CLIENT_ID" in script.js with your Google Client ID.');
            return;
        }
        loadGoogleDriveAPI();
    }

    function loadGoogleDriveAPI() {
        const gapiScript = document.createElement('script');
        gapiScript.src = 'https://apis.google.com/js/api.js';
        gapiScript.onload = gapiLoaded;
        document.body.appendChild(gapiScript);

        const gisScript = document.createElement('script');
        gisScript.src = 'https://accounts.google.com/gsi/client';
        gisScript.onload = gisLoaded;
        document.body.appendChild(gisScript);
    }

    function gapiLoaded() {
        gapi.load('client', async () => {
            await gapi.client.init({
                discoveryDocs: [DISCOVERY_DOC],
            });
            gapiInited = true;
            if (gisInited) {
                handleAuthClick();
            }
        });
    }

    function gisLoaded() {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse) => {
                accessToken = tokenResponse.access_token;
                findAndLoadGoogleAiStudioFolder();
            },
        });
        gisInited = true;
        if (gapiInited) {
            handleAuthClick();
        }
    }

    function handleAuthClick() {
        if (accessToken) {
            findAndLoadGoogleAiStudioFolder();
        } else {
            tokenClient.requestAccessToken({prompt: 'consent'});
        }
    }

    async function findAndLoadGoogleAiStudioFolder() {
        try {
            const res = await gapi.client.drive.files.list({
                q: "mimeType='application/vnd.google-apps.folder' and name='Google AI Studio'",
                fields: 'files(id, name)',
            });

            if (res.result.files && res.result.files.length > 0) {
                let newFileHandles = [];
                for (const folder of res.result.files) {
                    console.log("Found 'Google AI Studio' folder with ID:", folder.id);
                    const handles = await loadFolderContents(folder.id);
                    newFileHandles = newFileHandles.concat(handles);
                }
                fileHandles = newFileHandles; // Replace existing file handles
                sortFiles();
                populateFileList();
                renderTags();
            } else {
                console.log("'Google AI Studio' folder not found.");
                alert("'Google AI Studio' folder not found in your Google Drive.");
            }
        } catch (err) {
            console.error("Error searching for 'Google AI Studio' folder:", err);
            alert("Error searching for folder. Check console for details.");
        }
    }

    async function loadFolderContents(folderId) {
        console.log('Loading contents for folder ID:', folderId);
        try {
            let files = [];
            let pageToken = null;
            do {
                const res = await gapi.client.drive.files.list({
                    //q: `'${folderId}' in parents and trashed=false and not (name contains '.png' or name contains '.jpg' or name contains '.pdf' or name contains '.webp' or name contains '.js' or name contains '.zip')`,
                    q: `'${folderId}' in parents and trashed=false and not (name contains '.png' or name contains '.jpg' or name contains '.pdf' or name contains '.webp' or name contains '.zip')`,
                    fields: 'files(id, name, modifiedTime), nextPageToken',
                    pageSize: 1000,
                    pageToken: pageToken,
                });
                files = files.concat(res.result.files);
                pageToken = res.result.nextPageToken;
            } while (pageToken);

            console.log('Drive API response files:', files);
            if (files && files.length > 0) {
                console.log('Found files:', files);
                const newFileHandles = files.map(file => ({
                    id: file.id,
                    name: file.name,
                    modifiedTime: new Date(file.modifiedTime).getTime(),
                    isGoogleDrive: true,
                }));
                return newFileHandles;
            } else {
                console.log('No files found in the folder.');
                return [];
            }
        } catch (err) {
            console.error("Error reading folder contents:", err);
            return [];
        }
    }

    async function loadGoogleDriveFileContent(handle) {
        if (fileCache.has(handle.id)) {
            const file = fileCache.get(handle.id);
            handleFileLoad(file);
            return;
        }

        try {
            const fileContentRes = await gapi.client.drive.files.get({
                fileId: handle.id,
                alt: 'media',
            });
            const fileContent = fileContentRes.body;
            const file = new File([fileContent], handle.name, {type: "application/json"});
            fileCache.set(handle.id, file);
            handleFileLoad(file);
        } catch (err) {
            console.error("Error reading file content from Google Drive:", err);
            alert("Error reading file content from Google Drive.");
        }
    }
});

function takeScreenshot() {
    const targetElement = document.querySelector('.container');
    const uploadButton = document.querySelector('button[onclick="takeScreenshot()"]');
    const loadingDiv = document.getElementById('loading');
    const screenshotResult = document.getElementById('screenshotResult');

    loadingDiv.style.display = 'none';
    screenshotResult.style.display = 'none';
    
    prepareForScreenshot();
    
    const options = {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: function(clonedDoc) {
            const clonedElement = clonedDoc.querySelector('.container');
            if (clonedElement) {
                cleanupClonedElement(clonedElement);
            }
        }
    };

    html2canvas(targetElement, options).then(canvas => {
        loadingDiv.style.display = 'block';
        screenshotResult.style.display = 'block';

        canvas.toBlob(blob => {
            const formData = new FormData();
            formData.append('file', blob, 'mjj.webp');

            fetch('https://skyimg.de/api/upload', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data && Array.isArray(data) && data[0].url) {
                    const imageUrl = data[0].url;

                    document.getElementById('screenshotResult').innerHTML =
                        `图片分享链接：<a href="${imageUrl}" target="_blank">点击查看</a>`;

                    navigator.clipboard.writeText(imageUrl).then(() => {
                        showToast('图片分享链接已复制到剪切板');
                    }, err => {
                        showToast('复制到剪切板失败');
                    });
                } else {
                    document.getElementById('screenshotResult').textContent = '上传成功但未获取到 URL！';
                }
                loadingDiv.style.display = 'none';
                uploadButton.style.visibility = 'visible';
                
                restoreAfterScreenshot();
            })
            .catch(error => {
                document.getElementById('screenshotResult').textContent = '上传失败！';
                console.error('Error:', error);
                loadingDiv.style.display = 'none';
                restoreAfterScreenshot();
            });
        });
    }).catch(error => {
        console.error('Screenshot error:', error);
        loadingDiv.style.display = 'none';
        restoreAfterScreenshot();
    });
}

function prepareForScreenshot() {
    window._screenshotState = {
        modifiedElements: []
    };
    
    const problematicSelectors = [
        '[class*="immersive"]', 
        '[class*="translation"]', 
        '[id*="immersive"]', 
        '[id*="translation"]',
        '.darkreader',
        '[id*="darkreader"]',
        '[class*="extension"]',
        '[id*="extension"]',
        'iframe'
    ];
    
    problematicSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            const originalDisplay = el.style.display;
            window._screenshotState.modifiedElements.push({
                element: el,
                property: 'display',
                value: originalDisplay
            });
            el.style.display = 'none';
        });
    });
    
    const elementsWithStyles = document.querySelectorAll('.container *');
    elementsWithStyles.forEach(el => {
        const stylesToFix = ['transform', 'perspective', 'filter', 'backdrop-filter'];
        
        stylesToFix.forEach(prop => {
            const computedStyle = window.getComputedStyle(el);
            const propValue = computedStyle.getPropertyValue(prop);
            
            if (propValue && propValue !== 'none') {
                window._screenshotState.modifiedElements.push({
                    element: el,
                    property: prop,
                    value: el.style[prop]
                });
                el.style[prop] = 'none';
            }
        });
    });
}

function cleanupClonedElement(element) {
    element.querySelectorAll('*').forEach(el => {
        const stylesToReset = [
            'transform', 'perspective', 'filter', 
            'backdrop-filter', 'transition', 'animation'
        ];
        
        stylesToReset.forEach(style => {
            if (el.style[style]) {
                el.style[style] = 'none';
            }
        });
        
        for (let i = 0; i < el.attributes.length; i++) {
            const attr = el.attributes[i];
            if (attr.name.startsWith('data-') && 
                (attr.name.includes('translation') || 
                 attr.name.includes('original') || 
                 attr.name.includes('immersive'))) {
                el.removeAttribute(attr.name);
            }
        }
    });
}

function restoreAfterScreenshot() {
    if (window._screenshotState && window._screenshotState.modifiedElements) {
        window._screenshotState.modifiedElements.forEach(item => {
            item.element.style[item.property] = item.value;
        });
    }
    window._screenshotState = null;
}
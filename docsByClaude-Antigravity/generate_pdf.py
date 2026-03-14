import os
import sys
import subprocess
import re

def install_package(package):
    subprocess.check_call([sys.executable, "-m", "pip", "install", package])

# Check and install dependencies
try:
    import markdown
except ImportError:
    print("Installing markdown...")
    install_package("markdown")
    import markdown

try:
    import pdfkit
except ImportError:
    print("Installing pdfkit...")
    install_package("pdfkit")
    import pdfkit

# Configuration
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(ROOT_DIR, 'SeoneFrontendDoc.pdf')

# CSS for content-aware page breaking and styling
CSS = """
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=JetBrains+Mono&display=swap');

    body {
        font-family: 'Inter', sans-serif;
        line-height: 1.6;
        color: #1a1a1a;
        max-width: 100%;
        margin: 0 auto;
        padding: 20px;
    }

    /* Typography */
    h1, h2, h3, h4, h5, h6 {
        font-family: 'Inter', sans-serif;
        color: #111;
        margin-top: 1.5em;
        margin-bottom: 0.5em;
        page-break-after: avoid;
    }

    h1 {
        font-size: 2.5em;
        border-bottom: 2px solid #eaeaea;
        padding-bottom: 0.3em;
        margin-top: 0;
        page-break-before: always; /* Start new sections on new page */
    }

    /* Don't break before the very first title */
    .first-section h1 {
        page-break-before: auto;
    }

    h2 { font-size: 1.8em; border-bottom: 1px solid #eaeaea; padding-bottom: 0.2em; }
    h3 { font-size: 1.4em; }
    
    p { margin-bottom: 1em; }

    /* Code Blocks */
    pre {
        background-color: #f6f8fa;
        border-radius: 6px;
        padding: 16px;
        overflow: auto;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.85em;
        border: 1px solid #e1e4e8;
        page-break-inside: avoid; /* Prevent code block splitting */
    }

    code {
        font-family: 'JetBrains Mono', monospace;
        background-color: rgba(27,31,35,0.05);
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-size: 0.85em;
    }

    pre code {
        background-color: transparent;
        padding: 0;
    }

    /* Tables */
    table {
        border-collapse: collapse;
        width: 100%;
        margin-bottom: 1.5em;
        page-break-inside: avoid; /* Prevent table splitting */
    }

    th, td {
        border: 1px solid #dfe2e5;
        padding: 8px 12px;
        text-align: left;
    }

    th {
        background-color: #f6f8fa;
        font-weight: 600;
    }

    tr:nth-child(2n) {
        background-color: #f8f8f8;
    }

    /* Quotes */
    blockquote {
        border-left: 4px solid #dfe2e5;
        color: #6a737d;
        padding-left: 1em;
        margin-left: 0;
        page-break-inside: avoid;
    }

    /* Images */
    img {
        max-width: 100%;
        height: auto;
        display: block;
        margin: 1.5em auto;
        page-break-inside: avoid;
    }

    /* Links */
    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Alerts (GitHub style) */
    blockquote {
        background-color: #f9f9f9;
        padding: 10px 20px;
    }
</style>
"""

def get_sorted_dirs(root):
    dirs = []
    for d in os.listdir(root):
        path = os.path.join(root, d)
        if os.path.isdir(path) and re.match(r'^\d{2}_', d):
            dirs.append(path)
    return sorted(dirs)

def generate_pdf():
    print(f"Scanning directories in {ROOT_DIR}...")
    dirs = get_sorted_dirs(ROOT_DIR)
    
    if not dirs:
        print("No documentation directories found (looking for 00_..., 01_...).")
        return

    full_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Seone Frontend Documentation</title>
        {CSS}
    </head>
    <body>
    """

    # Markdown extensions
    md = markdown.Markdown(extensions=['fenced_code', 'tables', 'toc', 'sane_lists'])

    print("Processing files...")
    for i, d in enumerate(dirs):
        readme_path = os.path.join(d, 'README.md')
        if os.path.exists(readme_path):
            print(f"  Reading {os.path.basename(d)}/README.md")
            with open(readme_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
                # Convert to HTML
                html_content = md.convert(content)
                
                # Wrap in a div to handle first-page logic
                section_class = "first-section" if i == 0 else "section"
                full_html += f'<div class="{section_class}">{html_content}</div>\n'
        else:
            print(f"  Warning: No README.md found in {os.path.basename(d)}")

    full_html += "</body></html>"

    print("Generating PDF...")
    try:
        # Configure pdfkit options
        options = {
            'page-size': 'A4',
            'margin-top': '20mm',
            'margin-right': '20mm',
            'margin-bottom': '20mm',
            'margin-left': '20mm',
            'encoding': "UTF-8",
            'no-outline': None,
            'enable-local-file-access': None  # Needed for CSS/Images
        }
        
        pdfkit.from_string(full_html, OUTPUT_FILE, options=options)
        print(f"Success! PDF generated at: {OUTPUT_FILE}")
        
    except OSError as e:
        if "wkhtmltopdf" in str(e):
            print("\nERROR: wkhtmltopdf not found or not executable.")
            print("Please install wkhtmltopdf:")
            print("  1. Download from https://wkhtmltopdf.org/downloads.html")
            print("  2. Install it")
            print("  3. Add the bin folder to your system PATH")
            print("  4. Run this script again")
        else:
            print(f"Error generating PDF: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")

if __name__ == "__main__":
    generate_pdf()

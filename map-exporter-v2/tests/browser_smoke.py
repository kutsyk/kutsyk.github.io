"""Run with a static server on port 8000: python3 map-exporter-v2/tests/browser_smoke.py."""
import json
import zipfile
from urllib.parse import parse_qs
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    fail = [True]
    requests = []

    def route(request_route):
        url = request_route.request.url
        if 'api/interpreter' in url:
            query = parse_qs(request_route.request.post_data)['data'][0]
            requests.append(query)
            # One section succeeds, one fails without subdivision (access denial).
            if fail[0] == 'overload':
                request_route.fulfill(status=502, body='Upstream overloaded')
            elif fail[0] and '(0,0.1,0.1,0.2)' in query:
                request_route.fulfill(status=403, body='Unavailable')
            else:
                request_route.fulfill(json={'elements': [
                    {'type': 'way', 'id': 1, 'tags': {'aeroway': 'runway'},
                     'geometry': [{'lon': 0.02, 'lat': 0.02}, {'lon': 0.18, 'lat': 0.08}]}
                ]})
        elif url.startswith('http://127.0.0.1:8000/'):
            request_route.continue_()
        else:
            request_route.abort()

    page.route('**/*', route)
    page.goto('http://127.0.0.1:8000/map-exporter-v2/')
    assert page.locator('#strategy').input_value() == 'adaptive'
    page.locator('#strategy').select_option('combined')
    assert 'together' in page.locator('#strategyInfo').inner_text()
    for box in page.locator('#layers input[type=checkbox]').all():
        box.uncheck()
    page.locator('#layer-airports').check()
    for key, value in [('west', '0'), ('south', '0'), ('east', '0.2'), ('north', '0.1')]:
        page.locator('#' + key).fill(value)
    page.locator('#start').click()
    page.wait_for_function("!document.querySelector('#retry').hidden && !document.querySelector('#retry').disabled")
    assert len(requests) == 4, requests
    assert page.locator('#download').is_disabled()
    page.locator('#partial').click()
    page.wait_for_function("document.querySelector('#jobTitle').textContent === 'Incomplete export ready'")
    assert page.locator('#preview #airports path').count() == 1
    assert 'INCOMPLETE' in page.locator('#resultInfo').inner_text()
    with page.expect_download() as download_info:
        page.locator('#download').click()
    assert download_info.value.suggested_filename.startswith('INCOMPLETE_')
    fail[0] = False
    page.locator('#retry').click()
    page.wait_for_function("document.querySelector('#jobTitle').textContent === 'Export ready'")
    assert len(requests) == 5, 'Retry must reuse the completed section'
    assert page.locator('#preview #airports path').count() == 1, 'Overlapping features must be deduplicated'
    assert 'Strategy: combined' in page.locator('#resultInfo').inner_text()
    assert '2/2 sections' in page.locator('#resultInfo').inner_text()
    with page.expect_download() as archive_info:
        page.locator('#downloadTiles').click()
    archive = archive_info.value
    assert archive.failure() is None
    with zipfile.ZipFile(archive.path()) as z:
        assert z.testzip() is None
        assert len([name for name in z.namelist() if name.endswith('.svg')]) == 2
        manifest = json.loads(z.read('manifest.json'))
        assert manifest['incomplete'] is False
        assert manifest['strategy'] == 'combined'
        assert len(manifest['tiles']) == 2
    # Reload confirms saved layer preferences, and mobile controls remain usable.
    page.reload()
    assert page.locator('#strategy').input_value() == 'combined'
    assert page.locator('#layer-airports').is_checked()
    assert not page.locator('#layer-buildings').is_checked()
    page.locator('#strategy').select_option('layers')
    page.locator('#layer-buildings').check()
    before_layers = len(requests)
    page.locator('#start').click()
    page.wait_for_function("document.querySelector('#jobTitle').textContent === 'Export ready'")
    layer_queries = requests[before_layers:]
    assert len(layer_queries) == 4
    assert all(('aeroway' in query) != ('building' in query) for query in layer_queries)
    assert 'Strategy: layers' in page.locator('#resultInfo').inner_text()
    assert page.locator('#preview #airports path').count() == 1
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    fail[0] = 'overload'
    before = len(requests)
    page.locator('#start').click()
    page.wait_for_function("document.querySelector('#jobTitle').textContent === 'Map services temporarily unavailable' && !document.querySelector('#retry').disabled")
    assert len(requests) == before + 3
    assert 'Retry unfinished sections after' in page.locator('#status').inner_text()
    page.locator('#retry').click()
    page.wait_for_function("!document.querySelector('#retry').disabled")
    assert len(requests) == before + 3, 'Immediate retry must not bypass cooldowns'
    assert not errors, errors
    print('PASS: partial export, worker SVG, resume, deduplication, ZIP contents/CRC, saved settings, mobile layout')
    browser.close()

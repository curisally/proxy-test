from flask import Flask, request, jsonify
from flask_cors import CORS
import threading
import requests
import time
import os

app = Flask(__name__, static_folder='dist', static_url_path='')
CORS(app)  # 允许跨域请求，方便开发

# 用于测试代理的目标URL
TEST_URL = 'https://api.ipify.org?format=json'
# 备选: TEST_URL = 'https://api.ipify.org?format=json'

def test_single_proxy(proxy_str, get_geo_location=False):
    """
    测试单个代理 (http, https, socks4, socks5)。
    代理格式: type://host:port 或 host:port (默认为 http)
    
    参数:
    - proxy_str: 代理字符串
    - get_geo_location: 是否获取地理位置信息 (使用 ip-api.com)
    """
    original_proxy_str = proxy_str.strip()
    if not original_proxy_str:
        return {"proxy": original_proxy_str, "status": "error", "error": "代理字符串为空"}

    proxy_parts = original_proxy_str.split('://')
    proxy_type_to_use = 'http'  # 默认
    address_part = original_proxy_str

    if len(proxy_parts) == 2:
        scheme = proxy_parts[0].lower()
        if scheme in ['http', 'https', 'socks4', 'socks5']:
            proxy_type_to_use = scheme
            address_part = proxy_parts[1]
        else:
            # If scheme is present but not recognized, treat full string as address part
            # This handles cases like "myproxy:1234" which might be misinterpreted if "myproxy" was a valid scheme
            address_part = original_proxy_str 
    elif len(proxy_parts) > 2:
         return {"proxy": original_proxy_str, "status": "error", "error": "代理格式无效，包含多个 '://'"}

    if ':' not in address_part:
        return {"proxy": original_proxy_str, "status": "error", "error": "代理地址格式无效 (应为 host:port)"}

    # Handle IPv6 addresses like [::1]:8080
    if address_part.startswith('['):
        host_end_idx = address_part.rfind(']')
        if host_end_idx == -1 or address_part[host_end_idx+1:].count(':') != 1: # Ensure ']:' is followed by port
                 return {"proxy": original_proxy_str, "status": "error", "error": "IPv6 代理地址格式无效"}
        host = address_part[:host_end_idx+1]
        port_str = address_part[host_end_idx+2:]
    else: # IPv4 or hostname
        parts = address_part.rsplit(':', 1)
        if len(parts) != 2:
            return {"proxy": original_proxy_str, "status": "error", "error": "代理地址格式无效 (host:port)"}
        host = parts[0]
        port_str = parts[1]

    if not host: # Check if host is empty after parsing
        return {"proxy": original_proxy_str, "status": "error", "error": "代理主机名为空"}
        
    try:
        port = int(port_str)
        if not (0 < port < 65536):
            raise ValueError("端口号超出范围")
    except ValueError:
        return {"proxy": original_proxy_str, "status": "error", "error": "无效的端口号"}

    # Construct the proxy URL for requests library
    # For SOCKS, requests expects socks5h or socks4a for hostname resolution by proxy
    if proxy_type_to_use == 'socks5':
        formatted_proxy_url = f"socks5h://{host}:{port}"
    elif proxy_type_to_use == 'socks4':
        formatted_proxy_url = f"socks4a://{host}:{port}"
    else: # http, https
        formatted_proxy_url = f"{proxy_type_to_use}://{host}:{port}"
        
    proxies_dict = {
        'http': formatted_proxy_url,
        'https': formatted_proxy_url # Use the same proxy for http and https test URL
    }

    session = requests.Session()
    start_time = time.time()
    result = {"proxy": original_proxy_str} # Initialize result

    try:
        # 1. Test proxy connectivity and get its public IP
        response = session.get(TEST_URL, proxies=proxies_dict, timeout=10, verify=False)
        response.raise_for_status() # Raises HTTPError for bad responses (4XX or 5XX)
        end_time = time.time()
        
        response_time_ms = (end_time - start_time) * 1000
        
        data = response.json()
        proxy_ip = data.get('origin') # httpbin.org returns 'origin'
        if not proxy_ip: # Fallback for other services like ipify
            proxy_ip = data.get('ip', 'N/A')

        result.update({
            "status": "success", 
            "ip": proxy_ip, 
            "response_time_ms": round(response_time_ms, 2)
        })
        
        # 2. If requested and proxy IP is valid, get geo location from ip-api.com
        if get_geo_location and proxy_ip != 'N/A':
            try:
                # IMPORTANT: Use the *same proxy* to query ip-api.com for *its own IP's location*
                # This means ip-api.com will see the request coming from proxy_ip
                geo_url = f"http://ip-api.com/json/{proxy_ip}" 
                
                # We make a new request for geo_location, potentially with its own timeout
                # It's crucial to use the `proxies_dict` here as well
                geo_response = session.get(geo_url, proxies=proxies_dict, timeout=15, verify=False)
                geo_response.raise_for_status()
                geo_location_data = geo_response.json()
                
                result["geo_location"] = geo_location_data # Full geo data
                
                # Extract specific fields for convenience if successful
                if geo_location_data.get("status") == "success":
                    result["city"] = geo_location_data.get("city")
                    result["country"] = geo_location_data.get("country")
                else:
                    result["geo_location_error"] = f"ip-api.com 查询失败: {geo_location_data.get('message', '未知错误')}"

            except requests.exceptions.Timeout as e_geo_timeout:
                result["geo_location_error"] = f"获取地理位置超时: {str(e_geo_timeout)}"
            except requests.exceptions.RequestException as e_geo:
                result["geo_location_error"] = f"获取地理位置请求失败: {str(e_geo)}"
            except Exception as e_geo_generic: # Catch any other unexpected errors
                result["geo_location_error"] = f"获取地理位置时发生意外错误: {str(e_geo_generic)}"

        elif get_geo_location and proxy_ip == 'N/A':
             result["geo_location_error"] = "无法获取代理IP，跳过地理位置查询"
        
        return result

    except requests.exceptions.ProxyError as e:
        error_msg = str(e)
        # Provide more specific SOCKS error if possible
        if "SOCKSHTTPSConnectionPool" in error_msg or "SOCKSHTTPConnectionPool" in error_msg:
             error_msg = f"SOCKS 代理连接错误: {e}"
        elif "Max retries exceeded with url" in error_msg: # Generic connection failure via proxy
            error_msg = f"连接目标失败 (通过代理): {e}"
        result.update({"status": "error", "error": f"代理错误: {error_msg}"})
    except requests.exceptions.ConnectTimeout:
        result.update({"status": "error", "error": "连接超时"})
    except requests.exceptions.ReadTimeout:
        result.update({"status": "error", "error": "读取超时"})
    except requests.exceptions.SSLError as e:
        result.update({"status": "error", "error": f"SSL 错误: {e}"})
    except requests.exceptions.RequestException as e: # Catch other request-related errors
        result.update({"status": "error", "error": f"请求失败: {e}"})
    except Exception as e: # Catch-all for other unexpected errors
        result.update({"status": "error", "error": f"发生意外错误: {e}"})
    finally:
        session.close()
    return result


@app.route('/get_location_via_proxy', methods=['POST'])
def get_location_via_proxy():
    """
    DEPRECATED: This route is less efficient. Use /test_proxies with get_geo_location=true.
    通过代理获取IP地址的地理位置信息
    请求体格式: 
    {
        "proxies": "代理列表，每行一个",
        "ip": "可选，要查询的IP地址，默认使用目标网站看到的IP",
        "max_threads": 10  // 可选，测试代理时的最大线程数
    }
    """
    data = request.get_json()
    if not data or 'proxies' not in data:
        return jsonify({"error": "请求体中缺少 'proxies' 字段"}), 400

    proxy_list_str = data['proxies']
    proxies_to_test = [p.strip() for p in proxy_list_str.splitlines() if p.strip()]
    target_ip_for_api = data.get('ip', None)  # IP to query on ip-api.com
    
    if not proxies_to_test:
        return jsonify({"error": "未提供代理"}), 400

    max_threads = data.get('max_threads', 10)
    try:
        max_threads = int(max_threads)
        if max_threads <= 0: max_threads = 10
    except ValueError:
        max_threads = 10

    # Test proxies first to find a working one
    results_collector = [None] * len(proxies_to_test)
    threads = []
    semaphore = threading.Semaphore(max_threads)

    # Worker for initial proxy test (without geo location for this deprecated route's logic)
    def initial_test_worker(proxy_str_arg, index_arg):
        with semaphore:
            # Call test_single_proxy but disable geo_location for the initial check
            # as this route's purpose is to use the *first working proxy* for a *specific IP query*
            results_collector[index_arg] = test_single_proxy(proxy_str_arg, get_geo_location=False) 

    for i, proxy_str_item in enumerate(proxies_to_test):
        thread = threading.Thread(target=initial_test_worker, args=(proxy_str_item, i))
        threads.append(thread)
        thread.start()
    for thread in threads:
        thread.join()

    working_proxies = [res for res in results_collector if res is not None and res.get("status") == "success"]
    
    if not working_proxies:
        return jsonify({"error": "没有可用的代理"}), 400
    
    first_working_proxy_details = working_proxies[0]
    proxy_to_use_str = first_working_proxy_details["proxy"]
    
    # Re-parse the working proxy string to construct proxies_dict for ip-api.com query
    # (This is somewhat redundant but ensures correct format for the second request)
    temp_proxy_parts = proxy_to_use_str.split('://')
    temp_proxy_type = 'http'
    temp_address_part = proxy_to_use_str
    if len(temp_proxy_parts) == 2:
        temp_scheme = temp_proxy_parts[0].lower()
        if temp_scheme in ['http', 'https', 'socks4', 'socks5']:
            temp_proxy_type = temp_scheme
            temp_address_part = temp_proxy_parts[1]
    
    if ':' not in temp_address_part:
        return jsonify({"error": "选中的代理地址格式无效"}), 400

    if temp_address_part.startswith('['):
        temp_host_end_idx = temp_address_part.rfind(']')
        temp_host = temp_address_part[:temp_host_end_idx+1]
        temp_port_str = temp_address_part[temp_host_end_idx+2:]
    else:
        temp_parts = temp_address_part.rsplit(':', 1)
        temp_host = temp_parts[0]
        temp_port_str = temp_parts[1]
    
    try:
        temp_port = int(temp_port_str)
    except ValueError:
        return jsonify({"error": "选中的代理端口无效"}), 400

    if temp_proxy_type == 'socks5':
        final_proxy_url = f"socks5h://{temp_host}:{temp_port}"
    elif temp_proxy_type == 'socks4':
        final_proxy_url = f"socks4a://{temp_host}:{temp_port}"
    else:
        final_proxy_url = f"{temp_proxy_type}://{temp_host}:{temp_port}"
        
    final_proxies_dict = {'http': final_proxy_url, 'https': final_proxy_url}
    
    # Now query ip-api.com for the target_ip_for_api (or the proxy's own IP if target_ip_for_api is None)
    # using the first_working_proxy
    ip_to_query_on_api = target_ip_for_api if target_ip_for_api else first_working_proxy_details.get("ip", "")
    if not ip_to_query_on_api: # If still no IP to query (e.g. proxy test failed to get IP)
        return jsonify({
            "error": "无法确定要查询的IP地址 (代理IP未知且未提供目标IP)",
            "proxy_used": proxy_to_use_str
        }), 400

    api_url = f"http://ip-api.com/json/{ip_to_query_on_api}"
    
    session = requests.Session()
    try:
        response = session.get(api_url, proxies=final_proxies_dict, timeout=15, verify=False)
        response.raise_for_status()
        location_data = response.json()
        
        if location_data.get("status") == "success":
            return jsonify({
                "proxy_used": proxy_to_use_str,
                "location_data": location_data,
                "city": location_data.get("city") # Consistent with /test_proxies
            })
        else:
            return jsonify({
                "error": f"ip-api.com 查询失败: {location_data.get('message', '未知错误')}",
                "proxy_used": proxy_to_use_str,
                "response_from_ip_api": location_data
            }), 400
            
    except requests.exceptions.Timeout:
        return jsonify({"error": "通过代理访问位置 API 超时", "proxy_used": proxy_to_use_str}), 500
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"通过代理访问位置 API 时出错: {str(e)}", "proxy_used": proxy_to_use_str}), 500
    finally:
        session.close()


@app.route('/test_proxies', methods=['POST'])
def test_proxies_route():
    data = request.get_json()
    if not data or 'proxies' not in data:
        return jsonify({"error": "请求体中缺少 'proxies' 字段"}), 400

    proxy_list_str = data['proxies']
    proxies_to_test = [p.strip() for p in proxy_list_str.splitlines() if p.strip()]

    if not proxies_to_test:
        return jsonify({"error": "未提供代理"}), 400

    max_threads = data.get('max_threads', 10)
    try:
        max_threads = int(max_threads)
        if max_threads <= 0: max_threads = 10
    except ValueError:
        max_threads = 10
    
    # Default to True to fetch geo location data from ip-api.com
    get_geo_location_flag = data.get('get_geo_location', True) 
    if isinstance(get_geo_location_flag, str): # Handle boolean from JSON string
        get_geo_location_flag = get_geo_location_flag.lower() in ('true', 'yes', '1', 'y')

    results_collector = [None] * len(proxies_to_test)
    threads = []
    semaphore = threading.Semaphore(max_threads)

    def worker(proxy_str_arg, index_arg):
        with semaphore:
            results_collector[index_arg] = test_single_proxy(proxy_str_arg, get_geo_location=get_geo_location_flag)

    for i, proxy_str_item in enumerate(proxies_to_test):
        thread = threading.Thread(target=worker, args=(proxy_str_item, i))
        threads.append(thread)
        thread.start()

    for thread in threads:
        thread.join()

    final_results = [res for res in results_collector if res is not None]
    return jsonify(final_results)

@app.route('/')
def serve_index():
    return app.send_static_file('index.html')

@app.route('/<path:path>')
def serve_spa(path):
    return app.send_static_file('index.html')

if __name__ == '__main__':
    # 确保已安装: pip install Flask Flask-CORS "requests[socks]"
    app.run(debug=True, port=5001, host='0.0.0.0')
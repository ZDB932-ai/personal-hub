import socket, json, sys
command = {'type':'execute_code','params':{'code':open(sys.argv[1],encoding='utf-8').read()}}
with socket.create_connection(('127.0.0.1',9876),timeout=20) as connection:
    connection.settimeout(180)
    connection.sendall(json.dumps(command).encode())
    data = b''
    while True:
        chunk = connection.recv(65536)
        if not chunk: raise RuntimeError('Blender disconnected before response')
        data += chunk
        try: result = json.loads(data); break
        except json.JSONDecodeError: pass
    print(json.dumps(result,ensure_ascii=False))
    if result.get('status') == 'error': sys.exit(1)

param(
    [string]$RustEditPath = 'C:\Program Files (x86)\RustEdit',
    [Parameter(Mandatory=$true)][string]$PrefabPath
)
# Run with Windows PowerShell 5.1: the installed libraries target .NET Framework.
# Uses only the installed codecs and an independent, minimal schema. No game is launched.
$ErrorActionPreference = 'Stop'
$managed = Join-Path $RustEditPath 'RustEdit_Data\Managed'
[void][System.Reflection.Assembly]::LoadFrom((Join-Path $managed 'protobuf-net.dll'))
[void][System.Reflection.Assembly]::LoadFrom((Join-Path $managed 'LZ4.dll'))
Add-Type -ReferencedAssemblies @((Join-Path $managed 'protobuf-net.dll'), 'System.Xml.dll', 'System.Core.dll') -TypeDefinition @'
using ProtoBuf;
using System.Collections.Generic;
[ProtoContract] public class WorkshopVector {
    [ProtoMember(1)] public float x;
    [ProtoMember(2)] public float y;
    [ProtoMember(3)] public float z;
}
[ProtoContract] public class WorkshopProp {
    [ProtoMember(1)] public string category;
    [ProtoMember(2)] public uint id;
    [ProtoMember(3)] public WorkshopVector position;
    [ProtoMember(4)] public WorkshopVector rotation;
    [ProtoMember(5)] public WorkshopVector scale;
}
[ProtoContract] public class WorkshopRoot {
    [ProtoMember(3)] public List<WorkshopProp> prefabs = new List<WorkshopProp>();
}
public static class WorkshopReader {
    public static WorkshopRoot Read(System.IO.Stream stream) {
        return ProtoBuf.Serializer.Deserialize<WorkshopRoot>(stream);
    }
}
'@
$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $PrefabPath))
if ([BitConverter]::ToUInt32($bytes,0) -ne 1) { throw 'Expected prefab version 1' }
$inputStream = [System.IO.MemoryStream]::new($bytes,4,($bytes.Length-4))
$lz = [LZ4.LZ4Stream]::new($inputStream,[LZ4.LZ4StreamMode]::Decompress,$false,65536,$true)
try {
    $root = [WorkshopReader]::Read($lz)
    if ($root.prefabs.Count -eq 0) { throw 'No prefabs decoded' }
    foreach ($prop in $root.prefabs) {
        if ($prop.id -eq 0 -or $null -eq $prop.position -or $null -eq $prop.scale) { throw 'Invalid prefab fields' }
    }
    Write-Output "Installed RustEdit LZ4 + protobuf-net verified $($root.prefabs.Count) prefabs."
} finally {
    $lz.Dispose()
    $inputStream.Dispose()
}

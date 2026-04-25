"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Eye,
  Edit3,
} from "lucide-react";

interface Skill {
  name: string;
  title: string;
  description: string;
  content: string;
}

export function SkillsManager() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", title: "", content: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Load skills
  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/reports/generate");
      const data = await res.json();
      
      // Load full content for each skill
      const skillDetails = await Promise.all(
        (data.skills || []).map(async (skill: any) => {
          const contentRes = await fetch(`/api/skills/${skill.name}`);
          const contentData = await contentRes.json();
          return {
            ...skill,
            content: contentData.content || "",
          };
        })
      );
      
      setSkills(skillDetails);
    } catch (err) {
      console.error("Failed to load skills:", err);
      setError("加载技能列表失败");
    } finally {
      setLoading(false);
    }
  };

  const handleViewSkill = (skill: Skill) => {
    setSelectedSkill(skill);
    setIsEditing(false);
  };

  const handleEditSkill = (skill: Skill) => {
    setSelectedSkill(skill);
    setEditForm({
      name: skill.name,
      title: skill.title,
      content: skill.content,
    });
    setIsEditing(true);
  };

  const handleCreateSkill = () => {
    console.log('Creating new skill...');
    setSelectedSkill(null);
    setEditForm({ name: "", title: "", content: "# 新技能模板\n\n## 功能说明\n在此描述技能的功能\n\n## 使用说明\n在此说明如何使用\n" });
    setIsCreating(true);
    setIsEditing(true);
    console.log('State updated:', { isCreating: true, isEditing: true });
  };

  const handleSave = async () => {
    console.log('handleSave called', { isCreating, editForm });
    
    if (!editForm.name.trim() || !editForm.title.trim() || !editForm.content.trim()) {
      console.log('Validation failed: empty fields');
      setError("请填写所有必填字段");
      return;
    }

    // Validate skill name (filename)
    const nameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!nameRegex.test(editForm.name)) {
      console.log('Validation failed: invalid name');
      setError("技能名称只能包含字母、数字、下划线和连字符");
      return;
    }

    console.log('Starting save...');
    setSaving(true);
    setError("");

    try {
      const payload = {
        action: isCreating ? "create" : "update",
        oldName: selectedSkill?.name,
        name: editForm.name,
        title: editForm.title,
        content: editForm.content,
      };
      console.log('Sending payload:', payload);
      
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      console.log('Response:', { status: res.status, data });

      if (!res.ok) {
        setError(data.error || "保存失败");
        return;
      }

      console.log('Save successful, reloading skills...');
      // Reload skills
      await loadSkills();
      
      // Update selected skill if editing
      if (selectedSkill && !isCreating) {
        const updated = skills.find(s => s.name === editForm.name);
        if (updated) {
          setSelectedSkill(updated);
        }
      }

      console.log('Resetting form state...');
      setIsCreating(false);
      setIsEditing(false);
      console.log('Save completed successfully');
    } catch (err) {
      console.error('Save error:', err);
      setError("保存失败: " + String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (skill: Skill) => {
    if (!confirm(`确定要删除技能 "${skill.title}" 吗？`)) {
      return;
    }

    try {
      const res = await fetch("/api/skills", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: skill.name }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "删除失败");
        return;
      }

      await loadSkills();
      setSelectedSkill(null);
    } catch (err) {
      setError("删除失败: " + String(err));
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Skills list */}
      <div className="w-64 border-r flex flex-col shrink-0 bg-white">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">SkillSpace</h3>
            <Button size="sm" onClick={handleCreateSkill} className="h-8 px-3" title="创建新Skill">
              <Plus className="h-4 w-4" />
              <span className="ml-1">新建</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            管理报告生成模板
          </p>
        </div>
        
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {skills.map((skill) => (
              <button
                key={skill.name}
                onClick={() => handleViewSkill(skill)}
                className={`w-full text-left p-3 rounded-lg transition-all ${
                  selectedSkill?.name === skill.name
                    ? "bg-blue-50 border border-blue-200"
                    : "hover:bg-gray-50 border border-transparent"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {skill.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {skill.description || "暂无描述"}
                    </p>
                  </div>
                  <FileText className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                </div>
              </button>
            ))}
            
            {skills.length === 0 && (
              <div className="text-center py-8">
                <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-500">暂无Skill</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Skill detail/editor */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {(selectedSkill || isCreating) ? (
          <>
            {/* Header */}
            <div className="border-b p-4 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-semibold">
                  {isCreating ? "新建Skill" : selectedSkill?.title}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isCreating ? "新技能" : `${selectedSkill?.name}.md`}
                </p>
              </div>
              <div className="flex gap-2">
                {!isEditing && selectedSkill && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditSkill(selectedSkill)}
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      编辑
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(selectedSkill)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      删除
                    </Button>
                  </>
                )}
                {isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsEditing(false);
                      setIsCreating(false);
                      setError("");
                    }}
                  >
                    取消
                  </Button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium block mb-1.5">
                      技能标识 {isCreating && "(英文)"}
                    </label>
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      placeholder="例如: alibaba-report"
                      disabled={saving || !isCreating}
                    />
                    {isCreating && (
                      <p className="text-xs text-muted-foreground mt-1">
                        只能包含字母、数字、下划线和连字符
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium block mb-1.5">
                      显示名称
                    </label>
                    <Input
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      placeholder="例如: 周报格式"
                      disabled={saving}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1.5">
                      Markdown 内容
                    </label>
                    <Textarea
                      value={editForm.content}
                      onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                      placeholder="输入 Markdown 格式的模板内容..."
                      rows={20}
                      className="font-mono text-sm"
                      disabled={saving}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={() => {
                        console.log('Cancel clicked');
                        setIsEditing(false);
                        setIsCreating(false);
                        setError("");
                      }}
                      disabled={saving}
                    >
                      取消
                    </Button>
                    <Button 
                      onClick={() => {
                        console.log('Save button clicked');
                        handleSave();
                      }} 
                      disabled={saving}
                      variant="default"
                    >
                      {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                      {saving ? "保存中..." : "保存"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="prose prose-sm max-w-none">
                  <div className="bg-gray-50 border rounded-lg p-4">
                    <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800">
                      {selectedSkill?.content}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-white to-gray-50">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <FileText className="h-8 w-8 text-white" />
              </div>
              <p className="text-lg font-semibold text-gray-900 mb-2">SkillSpace</p>
              <p className="text-sm text-gray-500">
                选择左侧的Skill进行查看或编辑
              </p>
              <Button className="mt-4" onClick={handleCreateSkill}>
                <Plus className="h-4 w-4 mr-1" />
                创建新技能
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
